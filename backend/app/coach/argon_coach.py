import json
from typing import Any, Optional
from google import genai
from google.genai import types
import google.auth

from ..config import settings
from ..problems import Problem
from ..resources import search_learning_resources
from ..sessions import RevisionNote, session_store


def create_argon_client() -> genai.Client:
    project = settings.google_cloud_project
    if not project:
        try:
            _, default_proj = google.auth.default()
            project = default_proj or ""
        except Exception:
            project = ""
    return genai.Client(
        vertexai=settings.google_genai_use_vertexai,
        project=project or None,
        location=settings.chat_location or "global",
    )


async def generate_with_argon(
    prompt: str,
    response_mime_type: Optional[str] = "application/json",
    temperature: float = 0.2,
) -> str:
    client = create_argon_client()
    cfg = types.GenerateContentConfig(temperature=temperature)
    if response_mime_type:
        cfg.response_mime_type = response_mime_type
    response = await client.aio.models.generate_content(
        model=settings.chat_model or "gemini-4-argon",
        contents=prompt,
        config=cfg,
    )
    return response.text or ""


async def chat_with_argon(
    problem: Problem,
    mode: str,
    user_message: str,
    code: str = "",
    cursor_line: int = 1,
    test_results: Optional[list[dict[str, Any]]] = None,
    transcript: Optional[list[dict[str, Any]]] = None,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    firm = settings.target_firm or "quants related"
    mode_lower = (mode or "tutor").lower()
    msg_lower = user_message.lower()
    unlock_solution = (
        mode_lower == "review"
        or problem.kind == "theory"
        or "show solution" in msg_lower
        or "optimal solution" in msg_lower
        or "reference solution" in msg_lower
        or "give me the code" in msg_lower
    )

    numbered_code = "\n".join(
        f"{idx + 1:3d}: {line}" for idx, line in enumerate((code or "").splitlines())
    )
    tests_summary = ""
    if test_results:
        lines = []
        for r in test_results[:8]:
            status_str = "PASS" if r.get("passed") else "FAIL"
            err_str = f" error={r.get('error')}" if r.get("error") else ""
            lines.append(
                f"  Test #{r.get('idx', 0) + 1}: {status_str} (got={r.get('got')}, expected={r.get('expected')}){err_str}"
            )
        tests_summary = "\n".join(lines)

    history_text = ""
    if transcript:
        history_text = "\n".join(
            f"{t.get('role', 'user').upper()}: {t.get('text', '')}"
            for t in transcript[-16:]
            if t.get("text")
        )

    hints_formatted = "\n".join(
        f"  Hint {i + 1}: {h}" for i, h in enumerate(problem.hints)
    )
    follow_ups_formatted = "\n".join(f"  - {f}" for f in problem.follow_ups)

    ref_block = (
        f"Reference Optimal Solution:\n{problem.reference_solution}"
        if unlock_solution
        else "(Reference solution locked in Tutor/Interview mode unless candidate asks 'show solution' or switches to Review mode — guide them Socratically without pasting the full answer.)"
    )

    prompt = f"""You are **Gemini 4 Argon** (`{settings.chat_model}`), the deep-reasoning algorithmic, mathematical, and ML post-training problem-solving brain inside LiveCoach (preparing the candidate for a {firm} technical interview).
You work alongside a real-time Gemini Live Voice Coach that speaks your `voice_summary` out loud while the candidate reads your detailed `reply` in the chat pane.

CURRENT MODE: {mode_lower.upper()}
- In TUTOR mode: Give mathematically & algorithmically rigorous Socratic guidance, pinpoint exact bug lines or invariant flaws, explain data structures/concepts clearly, and guide them toward the optimal {problem.optimal.time} time / {problem.optimal.space} space solution. Do not dump the full final solution code unless they explicitly asked "show solution".
- In INTERVIEW mode: Be a crisp, realistic interviewer. Probe time/space complexity, edge cases, and subtle bugs.
- In REVIEW mode (or if user asked "show solution"): Provide the complete optimal solution walkthrough, exact mathematical/complexity derivation, idiomatic Python/NumPy improvements, and connections to LLM post-training / quantitative systems.

[PROBLEM]
ID: {problem.id} — {problem.title} ({problem.difficulty}, Track: {problem.track})
Patterns: {", ".join(problem.pattern)}
Optimal Complexity: Time {problem.optimal.time}, Space {problem.optimal.space}
Post-Training / Quant Relevance: {problem.post_training_relevance}
Statement:
{problem.statement}

Progressive Hints:
{hints_formatted or "  (none)"}

Follow-up Questions:
{follow_ups_formatted or "  (none)"}

{ref_block}

[CANDIDATE'S CURRENT EDITOR CODE (cursor at line {cursor_line})]
```python
{numbered_code or "(empty)"}
```

[LATEST TEST RESULTS]
{tests_summary or "(No test runs yet)"}

[RECENT CONVERSATION TRANSCRIPT]
{history_text or "(Start of conversation)"}

[CANDIDATE'S NEW MESSAGE TO GEMINI 4 ARGON]
{user_message}

Return a valid JSON object with the following fields:
- "reply": (string, required) Your rich, well-structured response for the Chat pane. Use clear explanations, formulas, complexity analysis, or small illustrative snippets.
- "voice_summary": (string, required) A natural 1 to 3 sentence spoken summary (no markdown symbols or backticks) that the Gemini Live Voice Coach can speak aloud to accompany your written chat reply.
- "highlight": (object or null) Optional editor line highlight if pointing out a specific bug or line range in the candidate's code: {{"line_start": <int>, "line_end": <int>, "note": "<short hover note>"}} or null.
- "reveal_hint_level": (integer or null) Optional 1-based hint level to reveal if the candidate asked for a hint.
- "save_note": (object or null) If the candidate asked to save a note OR if you just explained a major concept/tutorial/derivation worth saving to Reference Notes, provide:
  {{"title": "<string>", "category": "<string>", "key_takeaways": ["<bullet1>", "<bullet2>", "<bullet3>"], "code_or_formula": "<python or math snippet>", "content": "<detailed revision explanation>"}}
  Otherwise null.
"""

    raw = await generate_with_argon(
        prompt, response_mime_type="application/json", temperature=0.2
    )
    parsed = json.loads(raw or "{}")
    reply = str(parsed.get("reply") or "Let's analyze this step by step.")
    voice_summary = str(parsed.get("voice_summary") or reply[:240])
    highlight = parsed.get("highlight")
    reveal_hint_level = parsed.get("reveal_hint_level")
    save_note_data = parsed.get("save_note")

    saved_note_dict = None
    if isinstance(save_note_data, dict) and save_note_data.get("title"):
        title = str(save_note_data.get("title"))
        category = str(
            save_note_data.get("category")
            or (
                problem.pattern[0].replace("_", " ").title()
                if problem.pattern
                else "General"
            )
        )
        resources = await search_learning_resources(
            f"{title} {category} python", max_results=3
        )
        note_obj = RevisionNote(
            problem_id=problem.id,
            problem_title=problem.title,
            title=title,
            category=category,
            key_takeaways=[
                str(x) for x in (save_note_data.get("key_takeaways") or [])
            ],
            code_or_formula=str(save_note_data.get("code_or_formula") or ""),
            content=str(save_note_data.get("content") or reply),
            resources=resources,
            source="argon_coach",
        )
        saved_note_dict = session_store.save_note(note_obj).model_dump()

    revealed_hint_dict = None
    if isinstance(reveal_hint_level, int) and problem.hints:
        lvl = max(1, min(reveal_hint_level, len(problem.hints)))
        if session_id:
            session_store.record_hint(session_id, lvl)
        revealed_hint_dict = {
            "level": lvl,
            "total": len(problem.hints),
            "text": problem.hints[lvl - 1],
        }

    return {
        "model": settings.chat_model,
        "reply": reply,
        "voice_summary": voice_summary,
        "highlight": highlight if isinstance(highlight, dict) else None,
        "revealed_hint": revealed_hint_dict,
        "saved_note": saved_note_dict,
    }
