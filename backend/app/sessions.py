import time
import uuid
from typing import Any, Optional
from pydantic import BaseModel, Field

from .config import settings
from .problems import problem_bank


class Scorecard(BaseModel):
    problem_id: str = ""
    mode: str = "interview"
    problem_understanding: int = Field(default=3, ge=1, le=4)
    approach_and_complexity: int = Field(default=3, ge=1, le=4)
    code_correctness: int = Field(default=3, ge=1, le=4)
    code_quality_and_idioms: int = Field(default=3, ge=1, le=4)
    communication: int = Field(default=3, ge=1, le=4)
    edge_cases_and_testing: int = Field(default=3, ge=1, le=4)
    hint_dependence: int = Field(default=4, ge=1, le=4)
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    recommended_next: list[str] = Field(default_factory=list)
    summary: str = ""
    created_at: float = Field(default_factory=time.time)


class RevisionNote(BaseModel):
    id: str = Field(default_factory=lambda: f"note-{uuid.uuid4().hex[:8]}")
    problem_id: str = ""
    problem_title: str = ""
    title: str
    category: str = "General"
    key_takeaways: list[str] = Field(default_factory=list)
    code_or_formula: str = ""
    content: str = ""
    resources: list[dict[str, Any]] = Field(default_factory=list)
    source: str = "live_coach"  # "live_coach" | "ai_summary" | "tutorial" | "manual"
    created_at: float = Field(default_factory=time.time)


import json
from pathlib import Path


class UserPersona(BaseModel):
    id: str = Field(default_factory=lambda: f"persona-{uuid.uuid4().hex[:8]}")
    name: str
    avatar_emoji: str = "🎓"
    role: str = "CS Student / Programmer"
    experience_level: str = "intermediate"  # "beginner" | "intermediate" | "advanced"
    coding_background: str = ""
    coaching_style: str = ""
    preferred_mode: str = "tutor"  # "tutor" | "interview" | "review"
    preferred_voice: str = "Puck"
    preferred_track: str = "all"   # "all" | "cs" | "ds" | "ml" | "theory"
    preferred_difficulty: str = "all"  # "all" | "easy" | "medium" | "hard"
    preferred_theme: str = "dark"  # "dark" | "light"
    is_builtin: bool = False
    created_at: float = Field(default_factory=time.time)


BUILTIN_PERSONAS: list[UserPersona] = [
    UserPersona(
        id="persona-student",
        name="CS Student (Grade 14 / College)",
        avatar_emoji="🎓",
        role="Grade 14 / Undergrad CS Student",
        experience_level="intermediate",
        coding_background=(
            "Studying Computer Science fundamentals in Python: arrays, strings, hash maps, "
            "two pointers, binary search, recursion, BFS/DFS graphs, and dynamic programming."
        ),
        coaching_style=(
            "Patient, encouraging mentor. Walk through small dry-run examples step-by-step, "
            "build visual intuition before writing code, explain Big-O clearly, and ask friendly Socratic questions."
        ),
        preferred_mode="tutor",
        preferred_voice="Puck",
        preferred_track="cs",
        preferred_difficulty="all",
        preferred_theme="dark",
        is_builtin=True,
    ),
    UserPersona(
        id="persona-beginner",
        name="Beginner / First-Time Coder",
        avatar_emoji="🌱",
        role="New to Python & Algorithms",
        experience_level="beginner",
        coding_background=(
            "Learning Python syntax (loops, lists, dictionaries, sets, functions) and basic algorithmic thinking from scratch."
        ),
        coaching_style=(
            "Super supportive, zero-jargon teacher. Explain Python syntax and built-in methods clearly with tiny 3-line examples, "
            "celebrate small wins, and guide one small step at a time."
        ),
        preferred_mode="tutor",
        preferred_voice="Puck",
        preferred_track="cs",
        preferred_difficulty="easy",
        preferred_theme="dark",
        is_builtin=True,
    ),
    UserPersona(
        id="persona-swe",
        name="Software Engineer (General LeetCode)",
        avatar_emoji="💻",
        role="Software Engineer / Interview Prep",
        experience_level="intermediate",
        coding_background=(
            "Practicing Blind 75 / NeetCode 150 patterns for software engineering interviews in Python."
        ),
        coaching_style=(
            "Practical SWE interview coach. Focus on clean modular Python, boundary edge cases, "
            "optimal time/space trade-offs, and clear verbal problem breakdown."
        ),
        preferred_mode="tutor",
        preferred_voice="Puck",
        preferred_track="all",
        preferred_difficulty="medium",
        preferred_theme="dark",
        is_builtin=True,
    ),
    UserPersona(
        id="persona-quant",
        name="Quant & ML Research Candidate",
        avatar_emoji="⚡",
        role="Quant DS & LLM Post-Training",
        experience_level="advanced",
        coding_background=(
            "Experienced in algorithms, NumPy vectorization, streaming statistics, numerical stability, "
            "and LLM post-training (DPO, GRPO, FlashAttention, KV cache)."
        ),
        coaching_style=(
            "Rigorous Socratic technical interviewer. Probe algorithmic invariants, cache locality, "
            "streaming constraints, numerical stability, and mathematical derivations."
        ),
        preferred_mode="interview",
        preferred_voice="Puck",
        preferred_track="ds",
        preferred_difficulty="all",
        preferred_theme="dark",
        is_builtin=True,
    ),
]


class SessionRecord(BaseModel):
    session_id: str = Field(default_factory=lambda: f"sess-{uuid.uuid4().hex[:10]}")
    problem_id: str
    mode: str = "tutor"
    persona_id: str = "persona-student"
    started_at: float = Field(default_factory=time.time)
    hints_used: list[int] = Field(default_factory=list)
    runs_count: int = 0
    submits_count: int = 0
    solved: bool = False
    resumption_handle: Optional[str] = None
    last_code: str = ""
    last_results: Optional[dict[str, Any]] = None
    scorecard: Optional[Scorecard] = None


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionRecord] = {}
        self._solved_ids: set[str] = set()
        self._pattern_stats: dict[str, dict[str, int]] = {}
        self._scorecards: list[Scorecard] = []
        self._notes: list[RevisionNote] = []
        self._personas: dict[str, UserPersona] = {p.id: p.model_copy() for p in BUILTIN_PERSONAS}
        self._personas_file = Path("/tmp/livecoach_personas.json")
        self._fs_client: Any = None
        if settings.use_firestore:
            try:
                from google.cloud import firestore  # type: ignore

                self._fs_client = firestore.Client(
                    project=settings.google_cloud_project or None
                )
            except Exception as e:
                print(f"[SessionStore] Firestore init failed, using memory: {e}")
        self._load_persisted_personas()

    def create_or_get(
        self,
        problem_id: str,
        mode: str = "tutor",
        session_id: Optional[str] = None,
    ) -> SessionRecord:
        if session_id and session_id in self._sessions:
            rec = self._sessions[session_id]
            rec.problem_id = problem_id
            rec.mode = mode
            return rec
        rec = SessionRecord(
            session_id=session_id or f"sess-{uuid.uuid4().hex[:10]}",
            problem_id=problem_id,
            mode=mode,
        )
        self._sessions[rec.session_id] = rec
        self._persist(rec)
        return rec

    def get(self, session_id: str) -> Optional[SessionRecord]:
        return self._sessions.get(session_id)

    def record_hint(self, session_id: str, level: int) -> None:
        rec = self._sessions.get(session_id)
        if not rec:
            return
        if level not in rec.hints_used:
            rec.hints_used.append(level)
        prob = problem_bank.get(rec.problem_id)
        if prob:
            for pat in prob.pattern:
                st = self._pattern_stats.setdefault(
                    pat, {"attempts": 0, "solved": 0, "hints": 0, "failed_runs": 0}
                )
                st["hints"] += 1
        self._persist(rec)

    def record_run(
        self,
        session_id: str,
        all_passed: bool,
        kind: str = "run",
        results: Optional[dict[str, Any]] = None,
    ) -> None:
        rec = self._sessions.get(session_id)
        if not rec:
            return
        if kind == "submit":
            rec.submits_count += 1
            if all_passed:
                rec.solved = True
                self._solved_ids.add(rec.problem_id)
        else:
            rec.runs_count += 1
        if results is not None:
            rec.last_results = results

        prob = problem_bank.get(rec.problem_id)
        if prob:
            for pat in prob.pattern:
                st = self._pattern_stats.setdefault(
                    pat, {"attempts": 0, "solved": 0, "hints": 0, "failed_runs": 0}
                )
                st["attempts"] += 1
                if kind == "submit" and all_passed:
                    st["solved"] += 1
                elif not all_passed:
                    st["failed_runs"] += 1
        self._persist(rec)

    def record_scorecard(self, session_id: str, scorecard: Scorecard) -> None:
        rec = self._sessions.get(session_id)
        if rec:
            scorecard.problem_id = rec.problem_id
            scorecard.mode = rec.mode
            rec.scorecard = scorecard
            self._persist(rec)
        self._scorecards.append(scorecard)

    def save_note(self, note: RevisionNote) -> RevisionNote:
        if note.problem_id and not note.problem_title:
            prob = problem_bank.get(note.problem_id)
            if prob:
                note.problem_title = prob.title
        # Update existing note if id matches, otherwise prepend
        for i, existing in enumerate(self._notes):
            if existing.id == note.id:
                self._notes[i] = note
                self._persist_note(note)
                return note
        self._notes.insert(0, note)
        self._persist_note(note)
        return note

    def list_notes(self, problem_id: Optional[str] = None) -> list[dict[str, Any]]:
        items = self._notes
        if problem_id:
            items = [n for n in items if n.problem_id == problem_id]
        return [n.model_dump() for n in items]

    def delete_note(self, note_id: str) -> bool:
        before = len(self._notes)
        self._notes = [n for n in self._notes if n.id != note_id]
        if self._fs_client:
            try:
                self._fs_client.collection("livecoach_notes").document(note_id).delete()
            except Exception:
                pass
        return len(self._notes) < before

    def pick_next_problem(
        self,
        current_id: Optional[str] = None,
        pattern: Optional[str] = None,
        difficulty: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        problems = problem_bank.list_all()
        candidates = [p for p in problems if p.id != current_id]
        if pattern:
            filtered = [p for p in candidates if pattern in p.pattern]
            if filtered:
                candidates = filtered
        if difficulty:
            filtered = [p for p in candidates if p.difficulty.lower() == difficulty.lower()]
            if filtered:
                candidates = filtered

        if not candidates:
            return None

        def score_problem(p: Any) -> tuple[int, int, str]:
            unsolved = 0 if p.id not in self._solved_ids else 1
            weakness = 0
            for pat in p.pattern:
                st = self._pattern_stats.get(pat, {})
                weakness -= st.get("failed_runs", 0) * 2 + st.get("hints", 0)
            return (unsolved, weakness, p.id)

        candidates.sort(key=score_problem)
        return candidates[0].to_list_item()

    def get_dashboard_stats(self) -> dict[str, Any]:
        return {
            "solved_ids": sorted(self._solved_ids),
            "pattern_stats": self._pattern_stats,
            "recent_scorecards": [s.model_dump() for s in self._scorecards[-10:]],
            "revision_notes": [n.model_dump() for n in self._notes],
            "active_sessions": len(self._sessions),
        }

    def list_personas(self) -> list[dict[str, Any]]:
        builtin_ids = {p.id for p in BUILTIN_PERSONAS}
        builtins = [self._personas[p.id].model_dump() for p in BUILTIN_PERSONAS if p.id in self._personas]
        customs = [
            p.model_dump()
            for pid, p in sorted(self._personas.items(), key=lambda kv: kv[1].created_at, reverse=True)
            if pid not in builtin_ids
        ]
        return builtins + customs

    def get_persona(self, persona_id: Optional[str] = None) -> UserPersona:
        if persona_id and persona_id in self._personas:
            return self._personas[persona_id]
        return self._personas.get("persona-student") or BUILTIN_PERSONAS[0]

    def save_persona(self, persona: UserPersona) -> UserPersona:
        builtin_ids = {p.id for p in BUILTIN_PERSONAS}
        if persona.id in builtin_ids:
            persona.is_builtin = True
        self._personas[persona.id] = persona
        self._persist_personas()
        return persona

    def delete_persona(self, persona_id: str) -> bool:
        builtin_ids = {p.id for p in BUILTIN_PERSONAS}
        if persona_id in builtin_ids or persona_id not in self._personas:
            return False
        del self._personas[persona_id]
        if self._fs_client:
            try:
                self._fs_client.collection("livecoach_personas").document(persona_id).delete()
            except Exception:
                pass
        self._persist_personas()
        return True

    def _load_persisted_personas(self) -> None:
        if self._personas_file.exists():
            try:
                data = json.loads(self._personas_file.read_text(encoding="utf-8"))
                for item in data:
                    p = UserPersona.model_validate(item)
                    self._personas[p.id] = p
            except Exception as e:
                print(f"[SessionStore] Could not read personas file: {e}")

    def _persist_personas(self) -> None:
        try:
            payload = [p.model_dump() for p in self._personas.values()]
            self._personas_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except Exception as e:
            print(f"[SessionStore] Could not write personas file: {e}")
        if self._fs_client:
            try:
                for p in self._personas.values():
                    self._fs_client.collection("livecoach_personas").document(p.id).set(
                        p.model_dump()
                    )
            except Exception as e:
                print(f"[SessionStore] Firestore persona write warning: {e}")

    def _persist(self, rec: SessionRecord) -> None:
        if not self._fs_client:
            return
        try:
            self._fs_client.collection("livecoach_sessions").document(rec.session_id).set(
                rec.model_dump()
            )
        except Exception as e:
            print(f"[SessionStore] Firestore write warning: {e}")

    def _persist_note(self, note: RevisionNote) -> None:
        if not self._fs_client:
            return
        try:
            self._fs_client.collection("livecoach_notes").document(note.id).set(
                note.model_dump()
            )
        except Exception as e:
            print(f"[SessionStore] Firestore note write warning: {e}")


session_store = SessionStore()
