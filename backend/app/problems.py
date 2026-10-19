from pathlib import Path
from typing import Any, Optional
import yaml
from pydantic import BaseModel, Field

from .config import settings


class ExampleItem(BaseModel):
    input: str
    output: str
    explanation: Optional[str] = None


class TestCaseItem(BaseModel):
    args: list[Any]
    expected: Any


class OptimalComplexity(BaseModel):
    time: str = "O(n)"
    space: str = "O(n)"


class Problem(BaseModel):
    id: str
    slug: str
    title: str
    kind: str = "coding"  # "coding" | "theory"
    track: str = "ds"     # "ds" | "ml" | "theory"
    leetcode: Optional[int] = None
    day: int = 1
    pattern: list[str] = Field(default_factory=list)
    difficulty: str = "medium"
    post_training_relevance: str = ""
    statement: str
    examples: list[ExampleItem] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    function_name: str = ""
    starter_code: str = ""
    tests: list[TestCaseItem] = Field(default_factory=list)
    hidden_tests: list[TestCaseItem] = Field(default_factory=list)
    compare: str = "exact"
    time_limit_ms: int = 2000
    hints: list[str] = Field(default_factory=list)
    optimal: OptimalComplexity = Field(default_factory=OptimalComplexity)
    follow_ups: list[str] = Field(default_factory=list)
    reference_solution: str = ""
    rubric_points: list[str] = Field(default_factory=list)

    def to_list_item(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "slug": self.slug,
            "title": self.title,
            "kind": self.kind,
            "track": self.track,
            "leetcode": self.leetcode,
            "day": self.day,
            "pattern": self.pattern,
            "difficulty": self.difficulty,
            "post_training_relevance": self.post_training_relevance,
            "optimal": self.optimal.model_dump(),
        }

    def to_public_dict(self) -> dict[str, Any]:
        """Serialize problem for browser consumption, strictly omitting reference_solution."""
        return {
            "id": self.id,
            "slug": self.slug,
            "title": self.title,
            "kind": self.kind,
            "track": self.track,
            "leetcode": self.leetcode,
            "day": self.day,
            "pattern": self.pattern,
            "difficulty": self.difficulty,
            "post_training_relevance": self.post_training_relevance,
            "statement": self.statement,
            "examples": [e.model_dump() for e in self.examples],
            "constraints": self.constraints,
            "function_name": self.function_name,
            "starter_code": self.starter_code,
            "tests": [t.model_dump() for t in self.tests],
            "hidden_tests": [t.model_dump() for t in self.hidden_tests],
            "compare": self.compare,
            "time_limit_ms": self.time_limit_ms,
            "hints_total": len(self.hints),
            "optimal": self.optimal.model_dump(),
            "follow_ups": self.follow_ups,
            "rubric_points": self.rubric_points,
        }


class ProblemBank:
    def __init__(self) -> None:
        self._problems: dict[str, Problem] = {}

    def load(self, directory: Optional[Path] = None) -> None:
        target_dir = directory or settings.problems_dir
        self._problems.clear()
        if not target_dir.exists():
            return
        for path in sorted(target_dir.glob("*.yaml")):
            with open(path, "r", encoding="utf-8") as f:
                raw = yaml.safe_load(f)
            if not raw:
                continue
            if "track" not in raw:
                pid = str(raw.get("id", ""))
                if pid.startswith("C") or pid.startswith("L"):
                    raw["track"] = "cs"
                elif pid.startswith("M"):
                    raw["track"] = "ml"
                elif pid.startswith("T"):
                    raw["track"] = "theory"
                    raw.setdefault("kind", "theory")
                else:
                    raw["track"] = "ds"
            prob = Problem.model_validate(raw)
            self._problems[prob.id] = prob

    def list_all(self) -> list[Problem]:
        def sort_key(p: Problem) -> tuple[int, str]:
            order = {"C": 0, "P": 1, "M": 2, "T": 3, "L": 4}.get(p.id[:1], 5)
            return (order, p.id)

        return sorted(self._problems.values(), key=sort_key)

    def get(self, problem_id: str) -> Optional[Problem]:
        return self._problems.get(problem_id)

    def next_custom_id(self) -> str:
        existing_nums = []
        for pid in self._problems:
            if pid.startswith("C") and pid[1:].isdigit():
                existing_nums.append(int(pid[1:]))
        next_num = (max(existing_nums) + 1) if existing_nums else 21
        return f"C{next_num:02d}"

    def add_problem(self, prob: Problem, persist: bool = True) -> Problem:
        self._problems[prob.id] = prob
        if persist:
            try:
                settings.problems_dir.mkdir(parents=True, exist_ok=True)
                safe_slug = prob.slug.replace("-", "_").replace(" ", "_")[:40]
                out_path = settings.problems_dir / f"{prob.id}_{safe_slug}.yaml"
                with open(out_path, "w", encoding="utf-8") as f:
                    yaml.safe_dump(
                        prob.model_dump(), f, sort_keys=False, allow_unicode=True
                    )
            except Exception as e:
                print(f"[ProblemBank] Could not persist custom problem YAML: {e}")
        return prob


problem_bank = ProblemBank()
