from contextlib import asynccontextmanager
import json
from typing import Any, Optional
from fastapi import Depends, FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types
import google.auth
from pydantic import BaseModel, Field

from .auth import get_vertex_access_token, verify_http_token
from .coach.live_proxy import handle_coach_websocket
from .coach.prompts import build_system_prompt
from .config import settings
from .problems import problem_bank
from .sessions import RevisionNote, Scorecard, session_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    problem_bank.load()
    print(
        f"[LiveCoach] Loaded {len(problem_bank.list_all())} problems from {settings.problems_dir}"
    )
    yield


app = FastAPI(title="LiveCoach API", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HintRequest(BaseModel):
    level: int = 1
    session_id: Optional[str] = None


class RunRecordRequest(BaseModel):
    session_id: Optional[str] = None
    problem_id: str
    all_passed: bool
    kind: str = "run"
    results: Optional[list[dict[str, Any]]] = None


class SynthesizeNoteRequest(BaseModel):
    problem_id: str
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    code: str = ""
    custom_topic: Optional[str] = None
    custom_prompt: Optional[str] = None


@app.get("/healthz")
@app.get("/health")
@app.get("/api/healthz")
async def healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "problems_loaded": len(problem_bank.list_all()),
        "live_model": settings.live_model,
        "location": settings.google_cloud_location,
    }


@app.get("/api/config", dependencies=[Depends(verify_http_token)])
async def get_config() -> dict[str, Any]:
    return {
        "live_model": settings.live_model,
        "live_voice": settings.live_voice,
        "avatar_model": settings.avatar_model,
        "avatar_voice": settings.avatar_voice,
        "target_firm": settings.target_firm,
        "auth_required": bool(settings.access_token),
    }


@app.get("/api/token", dependencies=[Depends(verify_http_token)])
async def get_token(
    problem_id: Optional[str] = None, mode: str = "tutor"
) -> dict[str, Any]:
    try:
        token_data = get_vertex_access_token()
        if problem_id:
            prob = problem_bank.get(problem_id)
            if prob:
                token_data["system_instruction"] = build_system_prompt(prob, mode)
        return token_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get access token: {e}")


@app.get("/api/problems", dependencies=[Depends(verify_http_token)])
async def list_problems(
    track: Optional[str] = None,
    pattern: Optional[str] = None,
    day: Optional[int] = None,
) -> list[dict[str, Any]]:
    items = problem_bank.list_all()
    if track:
        items = [p for p in items if p.track == track]
    if pattern:
        items = [p for p in items if pattern in p.pattern]
    if day is not None:
        items = [p for p in items if p.day == day]
    return [p.to_list_item() for p in items]


@app.get("/api/problems/{problem_id}", dependencies=[Depends(verify_http_token)])
async def get_problem(problem_id: str) -> dict[str, Any]:
    prob = problem_bank.get(problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail=f"Problem {problem_id} not found")
    return prob.to_public_dict()


@app.post("/api/problems/{problem_id}/hint", dependencies=[Depends(verify_http_token)])
async def reveal_problem_hint(problem_id: str, req: HintRequest) -> dict[str, Any]:
    prob = problem_bank.get(problem_id)
    if not prob:
        raise HTTPException(status_code=404, detail=f"Problem {problem_id} not found")
    if not prob.hints:
        raise HTTPException(status_code=400, detail="No hints for this problem")
    level = max(1, min(req.level, len(prob.hints)))
    if req.session_id:
        session_store.record_hint(req.session_id, level)
    return {
        "level": level,
        "total": len(prob.hints),
        "text": prob.hints[level - 1],
    }


@app.get("/api/sessions", dependencies=[Depends(verify_http_token)])
async def get_sessions_dashboard() -> dict[str, Any]:
    return session_store.get_dashboard_stats()


@app.post("/api/sessions/run", dependencies=[Depends(verify_http_token)])
async def record_run_endpoint(req: RunRecordRequest) -> dict[str, Any]:
    rec = session_store.create_or_get(
        problem_id=req.problem_id, session_id=req.session_id
    )
    session_store.record_run(
        rec.session_id,
        all_passed=req.all_passed,
        kind=req.kind,
        results={"results": req.results or [], "all_passed": req.all_passed},
    )
    return {
        "session_id": rec.session_id,
        "solved": rec.solved,
        "dashboard": session_store.get_dashboard_stats(),
    }


@app.post("/api/sessions/scorecard", dependencies=[Depends(verify_http_token)])
async def submit_scorecard_endpoint(
    scorecard: Scorecard, session_id: Optional[str] = None
) -> dict[str, Any]:
    rec = session_store.create_or_get(
        problem_id=scorecard.problem_id or "P01",
        mode=scorecard.mode or "interview",
        session_id=session_id,
    )
    session_store.record_scorecard(rec.session_id, scorecard)
    return {"status": "ok", "scorecard": scorecard.model_dump()}


@app.post("/api/sessions/next", dependencies=[Depends(verify_http_token)])
async def pick_next_problem_endpoint(
    current_id: Optional[str] = None,
    pattern: Optional[str] = None,
    difficulty: Optional[str] = None,
) -> dict[str, Any]:
    picked = session_store.pick_next_problem(
        current_id=current_id, pattern=pattern, difficulty=difficulty
    )
    if not picked:
        raise HTTPException(status_code=404, detail="No problem available")
    return picked


@app.get("/api/notes", dependencies=[Depends(verify_http_token)])
async def list_revision_notes(problem_id: Optional[str] = None) -> list[dict[str, Any]]:
    return session_store.list_notes(problem_id=problem_id)


@app.post("/api/notes", dependencies=[Depends(verify_http_token)])
async def create_or_update_note(note: RevisionNote) -> dict[str, Any]:
    saved = session_store.save_note(note)
    return saved.model_dump()


@app.delete("/api/notes/{note_id}", dependencies=[Depends(verify_http_token)])
async def remove_revision_note(note_id: str) -> dict[str, Any]:
    deleted = session_store.delete_note(note_id)
    return {"deleted": deleted, "id": note_id}


@app.post("/api/notes/synthesize", dependencies=[Depends(verify_http_token)])
async def synthesize_revision_note(req: SynthesizeNoteRequest) -> dict[str, Any]:
    if not problem_bank.list_all():
        problem_bank.load()
    prob = problem_bank.get(req.problem_id) or problem_bank.list_all()[0]
    transcript_text = "\n".join(
        f"{item.get('role', 'user').upper()}: {item.get('text', '')}"
        for item in req.transcript[-30:]
        if item.get("text")
    )
    focus_topic = req.custom_topic or req.custom_prompt or ""

    prompt = f"""You are LiveCoach generating a high-signal Reference Revision Note for an ML / Quant research interview candidate.

Problem: {prob.id} — {prob.title}
Patterns: {", ".join(prob.pattern)}
Optimal Complexity: Time {prob.optimal.time}, Space {prob.optimal.space}
Post-Training Relevance: {prob.post_training_relevance}
Problem Statement:
{prob.statement}

Candidate's Current Code / Scratchpad:
{req.code}

Live Voice & Chat Discussion Transcript:
{transcript_text or "(No transcript yet — summarize the core concept, algorithm invariant, and post-training connection for this problem.)"}

{f"Specific focus requested by candidate: {focus_topic}" if focus_topic else ""}

Return a JSON object with:
- "title": concise, memorable revision title for the concept discussed
- "category": clean category tag (e.g. "Prefix Sum", "Two Heaps", "Sliding Window", "DPO / RLHF", "Numerics & Softmax", "Attention & KV Cache", "Probability")
- "key_takeaways": array of 3 to 5 crisp, high-yield bullet points covering the invariant, complexity, edge cases, and interview insights from the discussion
- "code_or_formula": canonical Python/NumPy template or key mathematical equations to memorize
- "content": structured revision note summarizing the concept, why naive approaches fail, and how it connects to LLM post-training
"""
    try:
        project = settings.google_cloud_project
        if not project:
            try:
                _, default_proj = google.auth.default()
                project = default_proj or ""
            except Exception:
                project = ""
        client = genai.Client(
            vertexai=settings.google_genai_use_vertexai,
            project=project or None,
            location=settings.google_cloud_location or "us-central1",
        )
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        parsed = json.loads(response.text or "{}")
        note = RevisionNote(
            problem_id=prob.id,
            problem_title=prob.title,
            title=str(parsed.get("title") or f"{prob.id}: {prob.title} — Key Concept"),
            category=str(
                parsed.get("category")
                or (prob.pattern[0].replace("_", " ").title() if prob.pattern else "General")
            ),
            key_takeaways=[str(x) for x in (parsed.get("key_takeaways") or prob.hints[:3])],
            code_or_formula=str(parsed.get("code_or_formula") or prob.reference_solution),
            content=str(parsed.get("content") or prob.post_training_relevance),
            source="ai_summary",
        )
    except Exception:
        # Fallback if model call fails
        note = RevisionNote(
            problem_id=prob.id,
            problem_title=prob.title,
            title=f"{prob.id}: {prob.title} ({prob.optimal.time})",
            category=prob.pattern[0].replace("_", " ").title() if prob.pattern else "General",
            key_takeaways=list(prob.hints) + list(prob.follow_ups[:2]),
            code_or_formula=prob.reference_solution,
            content=prob.post_training_relevance,
            source="ai_summary",
        )

    saved = session_store.save_note(note)
    return saved.model_dump()


@app.websocket("/ws/coach")
async def ws_coach_endpoint(websocket: WebSocket) -> None:
    await handle_coach_websocket(websocket)


# Serve static frontend if built
if settings.static_dir.exists():
    assets_dir = settings.static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    worklets_dir = settings.static_dir / "audio-worklets"
    if worklets_dir.exists():
        app.mount(
            "/audio-worklets",
            StaticFiles(directory=str(worklets_dir)),
            name="audio-worklets",
        )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = settings.static_dir / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        index_file = settings.static_dir / "index.html"
        if index_file.is_file():
            return FileResponse(str(index_file))
        raise HTTPException(status_code=404, detail="Not Found")
