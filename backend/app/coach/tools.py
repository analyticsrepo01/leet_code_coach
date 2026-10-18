from typing import Any, Callable, Coroutine
from google.genai import types

from ..problems import Problem
from ..resources import search_learning_resources
from ..sessions import RevisionNote, Scorecard, session_store

CLIENT_SIDE_TOOLS = {
    "get_editor_state",
    "run_tests",
    "highlight_line",
    "start_timer",
    "stop_timer",
}

SERVER_SIDE_TOOLS = {
    "reveal_hint",
    "get_problem_details",
    "submit_scorecard",
    "next_problem",
    "save_revision_note",
}


def get_tool_declarations() -> list[types.Tool]:
    return [
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="get_editor_state",
                    description="Read the candidate's current code in the editor, cursor line, and latest test results.",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={},
                    ),
                ),
                types.FunctionDeclaration(
                    name="run_tests",
                    description="Trigger the browser Pyodide runner to execute visible tests (or hidden tests if hidden=True).",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={
                            "hidden": types.Schema(
                                type="BOOLEAN",
                                description="Whether to run hidden submission tests in addition to visible tests.",
                            )
                        },
                    ),
                ),
                types.FunctionDeclaration(
                    name="highlight_line",
                    description="Highlight a line range in the candidate's Monaco code editor with an inline coaching note.",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={
                            "line_start": types.Schema(
                                type="INTEGER",
                                description="1-based start line number to highlight.",
                            ),
                            "line_end": types.Schema(
                                type="INTEGER",
                                description="1-based end line number to highlight.",
                            ),
                            "note": types.Schema(
                                type="STRING",
                                description="Brief note or Socratic question shown on hover (e.g., 'Off-by-one when k=0?').",
                            ),
                        },
                        required=["line_start", "line_end", "note"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="reveal_hint",
                    description="Reveal a specific hint level (1-based) from the problem's hint ladder in the UI and return its text.",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={
                            "level": types.Schema(
                                type="INTEGER",
                                description="1-based hint level to reveal (1, 2, 3, ...).",
                            )
                        },
                        required=["level"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="get_problem_details",
                    description="Fetch additional problem details: 'follow_ups', 'optimal', or 'reference_solution'. Only fetch reference_solution in Review mode or if the user explicitly said 'show solution'.",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={
                            "field": types.Schema(
                                type="STRING",
                                description="One of: 'follow_ups', 'optimal', 'reference_solution'.",
                            )
                        },
                        required=["field"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="start_timer",
                    description="Start the countdown timer in the UI (default 45 minutes for Interview mode).",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={
                            "minutes": types.Schema(
                                type="INTEGER",
                                description="Duration in minutes (e.g., 45).",
                            )
                        },
                        required=["minutes"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="stop_timer",
                    description="Stop the active interview countdown timer.",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={},
                    ),
                ),
                types.FunctionDeclaration(
                    name="submit_scorecard",
                    description="Submit the end-of-session evaluation scorecard (1-4 scale per dimension) and display it to the candidate.",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={
                            "problem_understanding": types.Schema(
                                type="INTEGER",
                                description="1-4 rating for problem restatement and clarifying questions.",
                            ),
                            "approach_and_complexity": types.Schema(
                                type="INTEGER",
                                description="1-4 rating for brute-force vs optimal analysis and Big-O complexity.",
                            ),
                            "code_correctness": types.Schema(
                                type="INTEGER",
                                description="1-4 rating for correctness and test pass rate.",
                            ),
                            "code_quality_and_idioms": types.Schema(
                                type="INTEGER",
                                description="1-4 rating for clean Python / NumPy idioms.",
                            ),
                            "communication": types.Schema(
                                type="INTEGER",
                                description="1-4 rating for thinking aloud clearly.",
                            ),
                            "edge_cases_and_testing": types.Schema(
                                type="INTEGER",
                                description="1-4 rating for identifying edge cases and numerical stability.",
                            ),
                            "hint_dependence": types.Schema(
                                type="INTEGER",
                                description="1-4 rating (4 = no hints needed, 1 = heavy hints needed).",
                            ),
                            "strengths": types.Schema(
                                type="ARRAY",
                                items=types.Schema(type="STRING"),
                                description="List of key strengths observed.",
                            ),
                            "improvements": types.Schema(
                                type="ARRAY",
                                items=types.Schema(type="STRING"),
                                description="List of specific, actionable areas to improve.",
                            ),
                            "recommended_next": types.Schema(
                                type="ARRAY",
                                items=types.Schema(type="STRING"),
                                description="Recommended problem IDs (e.g. ['P12', 'M04']) to practice next.",
                            ),
                            "summary": types.Schema(
                                type="STRING",
                                description="Concise overall assessment summary.",
                            ),
                        },
                        required=[
                            "problem_understanding",
                            "approach_and_complexity",
                            "code_correctness",
                            "code_quality_and_idioms",
                            "communication",
                            "edge_cases_and_testing",
                            "hint_dependence",
                            "strengths",
                            "improvements",
                        ],
                    ),
                ),
                types.FunctionDeclaration(
                    name="next_problem",
                    description="Select the next recommended problem (optionally filtered by pattern or difficulty) and switch the UI to it.",
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={
                            "pattern": types.Schema(
                                type="STRING",
                                description="Optional pattern filter, e.g. 'heap', 'prefix_sum', 'numerics'.",
                            ),
                            "difficulty": types.Schema(
                                type="STRING",
                                description="Optional difficulty filter: 'easy', 'medium', 'hard'.",
                            ),
                        },
                    ),
                ),
                types.FunctionDeclaration(
                    name="save_revision_note",
                    description=(
                        "Create and save a structured Reference Revision Note in the candidate's Reference Notes tab. "
                        "Call this whenever the candidate asks to save/take a note on a concept, formula, trick, or complexity insight, "
                        "or when wrapping up an important derivation or review discussion."
                    ),
                    parameters=types.Schema(
                        type="OBJECT",
                        properties={
                            "title": types.Schema(
                                type="STRING",
                                description="Concise title of the concept or pattern (e.g., 'Prefix Sum + Counter Invariant' or 'DPO Implicit Reward Derivation').",
                            ),
                            "category": types.Schema(
                                type="STRING",
                                description="Topic tag such as 'Prefix Sum', 'Heaps', 'Sliding Window', 'DPO / RLHF', 'Numerics & Softmax', 'Attention & KV Cache', or 'Probability'.",
                            ),
                            "key_takeaways": types.Schema(
                                type="ARRAY",
                                items=types.Schema(type="STRING"),
                                description="2-5 crisp bullet-point takeaways, edge cases, or interview habits to remember.",
                            ),
                            "code_or_formula": types.Schema(
                                type="STRING",
                                description="Canonical Python/NumPy snippet or mathematical formula for quick revision.",
                            ),
                            "content": types.Schema(
                                type="STRING",
                                description="Detailed explanation or summary of what was discussed.",
                            ),
                        },
                        required=["title", "category", "key_takeaways", "content"],
                    ),
                ),
            ]
        )
    ]


async def execute_server_tool(
    name: str,
    args: dict[str, Any],
    session_id: str,
    problem: Problem,
    mode: str,
    allow_solution: bool,
    send_to_browser: Callable[[dict[str, Any]], Coroutine[Any, Any, None]],
) -> dict[str, Any]:
    if name == "reveal_hint":
        total = len(problem.hints)
        if total == 0:
            return {"error": "No hints available for this problem."}
        rec = session_store.get(session_id)
        default_next = (max(rec.hints_used) + 1) if (rec and rec.hints_used) else 1
        req_level = int(args.get("level") or default_next)
        level = max(1, min(req_level, total))
        hint_text = problem.hints[level - 1]
        session_store.record_hint(session_id, level)
        await send_to_browser(
            {
                "type": "hint",
                "level": level,
                "total": total,
                "text": hint_text,
            }
        )
        return {
            "level": level,
            "total": total,
            "hint": hint_text,
        }

    if name == "get_problem_details":
        field = str(args.get("field", "")).strip()
        if field == "follow_ups":
            return {"follow_ups": problem.follow_ups}
        if field == "optimal":
            return {"optimal": problem.optimal.model_dump()}
        if field == "reference_solution":
            if mode == "review" or allow_solution or problem.kind == "theory":
                return {"reference_solution": problem.reference_solution}
            return {
                "error": (
                    "Reference solution is locked in Tutor/Interview mode unless the "
                    "candidate explicitly says 'show solution' or switches to Review mode."
                )
            }
        return {"error": f"Unknown field '{field}'."}

    if name == "submit_scorecard":
        clamped = dict(args)
        for k in (
            "problem_understanding",
            "approach_and_complexity",
            "code_correctness",
            "code_quality_and_idioms",
            "communication",
            "edge_cases_and_testing",
            "hint_dependence",
        ):
            if k in clamped:
                try:
                    clamped[k] = max(1, min(4, int(clamped[k])))
                except Exception:
                    clamped[k] = 3
        scorecard = Scorecard(**clamped)
        session_store.record_scorecard(session_id, scorecard)
        payload = scorecard.model_dump()
        await send_to_browser({"type": "score", "scorecard": payload})
        return {"status": "scorecard_displayed", "scorecard": payload}

    if name == "next_problem":
        picked = session_store.pick_next_problem(
            current_id=problem.id,
            pattern=args.get("pattern"),
            difficulty=args.get("difficulty"),
        )
        if not picked:
            return {"error": "No matching problem found."}
        await send_to_browser({"type": "next_problem", "problem": picked})
        return {"picked_problem": picked}

    if name == "save_revision_note":
        title = str(args.get("title") or f"{problem.id}: {problem.title}")
        category = str(
            args.get("category")
            or (problem.pattern[0].replace("_", " ").title() if problem.pattern else "General")
        )
        resources = await search_learning_resources(f"{title} {category} python", max_results=3)
        note = RevisionNote(
            problem_id=problem.id,
            problem_title=problem.title,
            title=title,
            category=category,
            key_takeaways=[str(x) for x in (args.get("key_takeaways") or [])],
            code_or_formula=str(args.get("code_or_formula") or ""),
            content=str(args.get("content") or ""),
            resources=resources,
            source="live_coach",
        )
        saved = session_store.save_note(note)
        payload = saved.model_dump()
        await send_to_browser({"type": "note_saved", "note": payload})
        return {"status": "note_saved", "note": payload}

    return {"error": f"Unhandled server tool: {name}"}
