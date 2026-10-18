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


class SessionRecord(BaseModel):
    session_id: str = Field(default_factory=lambda: f"sess-{uuid.uuid4().hex[:10]}")
    problem_id: str
    mode: str = "tutor"
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
        self._fs_client: Any = None
        if settings.use_firestore:
            try:
                from google.cloud import firestore  # type: ignore

                self._fs_client = firestore.Client(
                    project=settings.google_cloud_project or None
                )
            except Exception as e:
                print(f"[SessionStore] Firestore init failed, using memory: {e}")

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
