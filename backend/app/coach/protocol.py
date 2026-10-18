from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class ClientStartMsg(BaseModel):
    type: Literal["start"] = "start"
    problem_id: str
    mode: Literal["tutor", "interview", "review"] = "tutor"
    session_id: Optional[str] = None


class ClientAudioMsg(BaseModel):
    type: Literal["audio"] = "audio"
    data: str  # base64 PCM16 16kHz mono


class ClientTextMsg(BaseModel):
    type: Literal["text"] = "text"
    text: str


class ClientCodeSnapshotMsg(BaseModel):
    type: Literal["code_snapshot"] = "code_snapshot"
    code: str
    cursor_line: int = 1
    reason: Literal["idle", "run", "submit"] = "idle"


class ClientTestResultsMsg(BaseModel):
    type: Literal["test_results"] = "test_results"
    results: list[dict[str, Any]] = Field(default_factory=list)
    all_passed: bool = False
    kind: Literal["run", "submit"] = "run"


class ClientScreenFrameMsg(BaseModel):
    type: Literal["screen_frame"] = "screen_frame"
    jpeg_b64: str


class ClientToolResultMsg(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    call_id: str
    name: Optional[str] = None
    result: dict[str, Any] = Field(default_factory=dict)


class ClientControlMsg(BaseModel):
    type: Literal["control"] = "control"
    action: Literal["switch_mode", "next_problem", "end", "reveal_hint"]
    mode: Optional[str] = None
    problem_id: Optional[str] = None
    level: Optional[int] = None
