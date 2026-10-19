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

import copy
import re
from .auth import get_vertex_access_token, verify_http_token
from .coach.argon_coach import chat_with_argon, generate_with_argon
from .coach.live_proxy import handle_coach_websocket
from .coach.prompts import build_system_prompt
from .config import settings
from .problems import ExampleItem, OptimalComplexity, Problem, TestCaseItem, problem_bank
from .resources import search_learning_resources
from .sessions import RevisionNote, Scorecard, UserPersona, session_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    problem_bank.load()
    print(
        f"[LiveCoach] Loaded {len(problem_bank.list_all())} problems from {settings.problems_dir}"
    )
    yield


app = FastAPI(title="LiveCoach API", version="1.3.0", lifespan=lifespan)

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
    persona_id: Optional[str] = None


class TutorialNoteRequest(BaseModel):
    topic: str
    problem_id: Optional[str] = None
    persona_id: Optional[str] = None


class GenerateProblemRequest(BaseModel):
    query: str
    difficulty: str = "medium"
    track: str = "cs"


class ChatRequest(BaseModel):
    problem_id: str
    mode: str = "tutor"
    message: str
    code: str = ""
    cursor_line: int = 1
    test_results: Optional[list[dict[str, Any]]] = None
    transcript: Optional[list[dict[str, Any]]] = None
    session_id: Optional[str] = None
    persona_id: Optional[str] = None


@app.get("/healthz")
@app.get("/health")
@app.get("/api/healthz")
async def healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "problems_loaded": len(problem_bank.list_all()),
        "live_model": settings.live_model,
        "live_location": settings.live_location,
        "chat_model": settings.chat_model,
        "chat_location": settings.chat_location,
        "location": settings.google_cloud_location,
    }


@app.get("/api/config", dependencies=[Depends(verify_http_token)])
async def get_config() -> dict[str, Any]:
    return {
        "live_model": settings.live_model,
        "live_location": settings.live_location,
        "live_voice": settings.live_voice,
        "chat_model": settings.chat_model,
        "chat_location": settings.chat_location,
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


@app.post("/api/problems/generate", dependencies=[Depends(verify_http_token)])
async def generate_new_problem(req: GenerateProblemRequest) -> dict[str, Any]:
    if not problem_bank.list_all():
        problem_bank.load()
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Problem query is required")

    next_id = problem_bank.next_custom_id()
    diff = req.difficulty.lower() if req.difficulty.lower() in ("easy", "medium", "hard") else "medium"
    track = req.track.lower() if req.track.lower() in ("cs", "ds", "ml") else "cs"

    prompt = f"""You are Gemini 4 Argon generating a complete, runnable Python LeetCode-style problem card for LiveCoach.
Requested Problem / Topic: {query}
Target Difficulty: {diff}
Track: {track}

IMPORTANT RULES FOR PYTHON EXECUTION:
- Use standard Python built-in types (`list`, `str`, `int`, `float`, `bool`, `dict`) for function arguments and return values so JSON test cases serialize directly without custom TreeNode/ListNode classes (represent trees/graphs/linked lists as arrays or adjacency lists if needed).
- Provide a clean `function_name` (snake_case), `starter_code` with type annotations and `pass`, and a working `reference_solution` defining that exact `function_name`.
- Provide 3 `tests` (visible) and 2 `hidden_tests` where `args` is a JSON array of positional arguments to pass to `function_name(*args)` and `expected` is the exact return value.

Return a valid JSON object with:
- "title": string (e.g. "Trapping Rain Water")
- "slug": string (kebab-case, e.g. "trapping-rain-water")
- "leetcode": integer or null (e.g. 42)
- "pattern": array of 1-3 snake_case pattern tags (e.g. ["two_pointers", "dynamic_programming"])
- "difficulty": "{diff}"
- "post_training_relevance": 1-sentence explanation of why this problem matters for CS fundamentals, interviews, or ML systems
- "statement": clear markdown problem description
- "examples": array of 2 objects {{"input": "...", "output": "...", "explanation": "..."}}
- "constraints": array of 2-3 constraint strings
- "function_name": snake_case function name
- "starter_code": Python starter function signature with docstring/comment and `pass`
- "reference_solution": complete, bug-free optimal Python implementation of `function_name`
- "tests": array of 3 objects {{"args": [...], "expected": ...}}
- "hidden_tests": array of 2 objects {{"args": [...], "expected": ...}}
- "hints": array of 3 progressive Socratic hints
- "optimal": {{"time": "O(...)", "space": "O(...)"}}
- "follow_ups": array of 2 follow-up interview questions
"""
    try:
        raw_json = await generate_with_argon(
            prompt, response_mime_type="application/json", temperature=0.2
        )
        parsed = json.loads(raw_json or "{}")
        fn_name = str(parsed.get("function_name") or "solve")
        ref_sol = str(parsed.get("reference_solution") or f"def {fn_name}(x):\n    return x\n")
        title = str(parsed.get("title") or query.title())
        slug = re.sub(r"[^a-z0-9-]+", "-", str(parsed.get("slug") or title).lower()).strip("-") or "custom-problem"

        # Auto-verify expected outputs using reference_solution so test cases are 100% consistent
        ns: dict[str, Any] = {}
        try:
            exec(ref_sol, ns)
        except Exception:
            pass
        ref_fn = ns.get(fn_name)

        def build_tests(raw_list: list[Any]) -> list[TestCaseItem]:
            items: list[TestCaseItem] = []
            for tc in raw_list or []:
                if not isinstance(tc, dict) or "args" not in tc:
                    continue
                args = tc["args"] if isinstance(tc["args"], list) else [tc["args"]]
                expected = tc.get("expected")
                if callable(ref_fn):
                    try:
                        expected = ref_fn(*copy.deepcopy(args))
                    except Exception:
                        pass
                items.append(TestCaseItem(args=args, expected=expected))
            return items

        tests = build_tests(parsed.get("tests") or [])
        hidden_tests = build_tests(parsed.get("hidden_tests") or [])
        if not tests:
            tests = [TestCaseItem(args=[1], expected=ref_fn(1) if callable(ref_fn) else 1)]

        opt_raw = parsed.get("optimal") or {}
        prob = Problem(
            id=next_id,
            slug=slug,
            title=title,
            kind="coding",
            track=track,
            leetcode=parsed.get("leetcode") if isinstance(parsed.get("leetcode"), int) else None,
            day=1,
            pattern=[str(p) for p in (parsed.get("pattern") or ["algorithms"])],
            difficulty=str(parsed.get("difficulty") or diff),
            post_training_relevance=str(
                parsed.get("post_training_relevance")
                or "Core algorithmic problem-solving & interview pattern."
            ),
            statement=str(parsed.get("statement") or f"Solve {title}."),
            examples=[
                ExampleItem(
                    input=str(ex.get("input", "")),
                    output=str(ex.get("output", "")),
                    explanation=ex.get("explanation"),
                )
                for ex in (parsed.get("examples") or [])
                if isinstance(ex, dict)
            ],
            constraints=[str(c) for c in (parsed.get("constraints") or [])],
            function_name=fn_name,
            starter_code=str(parsed.get("starter_code") or f"def {fn_name}():\n    pass\n"),
            tests=tests,
            hidden_tests=hidden_tests,
            compare="exact",
            time_limit_ms=2000,
            hints=[str(h) for h in (parsed.get("hints") or ["Break the problem into smaller cases."])],
            optimal=OptimalComplexity(
                time=str(opt_raw.get("time", "O(n)")),
                space=str(opt_raw.get("space", "O(n)")),
            ),
            follow_ups=[str(f) for f in (parsed.get("follow_ups") or [])],
            reference_solution=ref_sol,
        )
        problem_bank.add_problem(prob, persist=True)
        return prob.to_public_dict()
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate problem '{query}': {e}"
        )


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
        raw_json = await generate_with_argon(
            prompt, response_mime_type="application/json", temperature=0.2
        )
        parsed = json.loads(raw_json or "{}")
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

    note.resources = await search_learning_resources(
        f"{focus_topic or note.title} {note.category} python", max_results=3
    )
    saved = session_store.save_note(note)
    return saved.model_dump()


@app.get("/api/notes/resources/search", dependencies=[Depends(verify_http_token)])
async def search_resources_endpoint(q: str) -> list[dict[str, Any]]:
    if not q or not q.strip():
        return []
    return await search_learning_resources(q.strip(), max_results=6)


@app.post("/api/notes/tutorial", dependencies=[Depends(verify_http_token)])
async def generate_from_scratch_tutorial(req: TutorialNoteRequest) -> dict[str, Any]:
    if not problem_bank.list_all():
        problem_bank.load()
    topic = req.topic.strip() or "Python Dictionaries (Hash Maps) from Scratch"
    prob = problem_bank.get(req.problem_id) if req.problem_id else None

    prompt = f"""You are LiveCoach (powered by Gemini 4 Argon) creating a beginner-friendly yet interview-grade "5-Minute From-Scratch Tutorial & Cheat-Sheet" in Python on:
Topic: {topic}
{f"Related Interview Problem: {prob.id} — {prob.title}" if prob else ""}

The candidate wants to learn this topic from scratch (for example, how to use it in Python, how it works under the hood, every essential method/idiom, and how it solves coding interview problems).

Return a JSON object with:
- "title": Clear tutorial title (e.g. "5-Min Tutorial: Python Hash Maps (dict, Counter, defaultdict)")
- "category": Clean category tag (e.g. "Python Fundamentals", "Hash Maps", "Heaps", "Sliding Window", "Dynamic Programming", "Probability")
- "key_takeaways": Array of 4 to 6 crisp bullet points covering:
  1. Mental model & why we use it (including time/space complexity of core operations)
  2. Essential Python syntax & methods to memorize
  3. Top 2 interview patterns where this immediately turns O(n^2) into O(n)
  4. Common pitfalls / edge cases in Python interviews
- "code_or_formula": A well-commented, runnable ~20-35 line Python cheat-sheet showing creation, lookup, iteration, idiomatic helpers (`get`, `setdefault`, `defaultdict`, `Counter`, etc.), and a classic interview mini-example
- "content": A clear, structured 5-minute read divided into:
  - 1. Mental Model (From Scratch)
  - 2. Step-by-Step Python Operations
  - 3. Classic Interview Pattern Walkthrough
  - 4. Practice Micro-Exercise
"""
    resources = await search_learning_resources(f"{topic} python tutorial", max_results=4)
    try:
        raw_json = await generate_with_argon(
            prompt, response_mime_type="application/json", temperature=0.2
        )
        parsed = json.loads(raw_json or "{}")
        note = RevisionNote(
            problem_id=prob.id if prob else "TUTORIAL",
            problem_title=prob.title if prob else "5-Min From-Scratch Tutorial",
            title=str(parsed.get("title") or f"5-Min Tutorial: {topic}"),
            category=str(parsed.get("category") or "Python Tutorial"),
            key_takeaways=[str(x) for x in (parsed.get("key_takeaways") or [])],
            code_or_formula=str(parsed.get("code_or_formula") or ""),
            content=str(parsed.get("content") or ""),
            resources=resources,
            source="tutorial",
        )
    except Exception as e:
        note = RevisionNote(
            problem_id=prob.id if prob else "TUTORIAL",
            problem_title=prob.title if prob else "5-Min From-Scratch Tutorial",
            title=f"5-Min Tutorial: {topic}",
            category="Python Tutorial",
            key_takeaways=[
                "Hash maps (Python dict) provide O(1) average-time lookup, insert, and delete.",
                "Use d.get(key, default) to avoid KeyError, or collections.defaultdict / Counter.",
                "Classic pattern: store seen values or prefix sums in a dict to turn O(n^2) nested loops into O(n).",
            ],
            code_or_formula=(
                "from collections import Counter, defaultdict\n\n"
                "# 1. Basic dict operations — O(1) average\n"
                "seen = {}\n"
                "seen['a'] = 1\n"
                "count = seen.get('a', 0)\n\n"
                "# 2. Frequency map with Counter\n"
                "freq = Counter(['a', 'b', 'a'])\n\n"
                "# 3. Grouping with defaultdict(list)\n"
                "groups = defaultdict(list)\n"
                "groups['key'].append(42)"
            ),
            content=f"5-Minute Tutorial on {topic}. (Fallback note: {e})",
            resources=resources,
            source="tutorial",
        )

    saved = session_store.save_note(note)
    return saved.model_dump()


@app.get("/api/personas", dependencies=[Depends(verify_http_token)])
async def list_personas_endpoint() -> list[dict[str, Any]]:
    return session_store.list_personas()


@app.post("/api/personas", dependencies=[Depends(verify_http_token)])
async def save_persona_endpoint(persona: UserPersona) -> dict[str, Any]:
    saved = session_store.save_persona(persona)
    return saved.model_dump()


@app.delete("/api/personas/{persona_id}", dependencies=[Depends(verify_http_token)])
async def delete_persona_endpoint(persona_id: str) -> dict[str, Any]:
    deleted = session_store.delete_persona(persona_id)
    return {"deleted": deleted, "id": persona_id}


@app.post("/api/chat", dependencies=[Depends(verify_http_token)])
async def argon_chat_endpoint(req: ChatRequest) -> dict[str, Any]:
    if not problem_bank.list_all():
        problem_bank.load()
    prob = problem_bank.get(req.problem_id) or problem_bank.list_all()[0]
    try:
        res = await chat_with_argon(
            problem=prob,
            mode=req.mode,
            user_message=req.message,
            code=req.code,
            cursor_line=req.cursor_line,
            test_results=req.test_results,
            transcript=req.transcript,
            session_id=req.session_id,
            persona_id=req.persona_id,
        )
        return res
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Gemini 4 Argon chat error: {e}"
        )


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
