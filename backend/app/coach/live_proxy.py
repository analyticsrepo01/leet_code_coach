import asyncio
import base64
import json
import traceback
from typing import Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
from google import genai
from google.genai import types
import google.auth

from ..auth import verify_ws_token
from ..config import settings
from ..problems import Problem, problem_bank
from ..sessions import session_store
from .prompts import build_system_prompt
from .tools import CLIENT_SIDE_TOOLS, execute_server_tool, get_tool_declarations


from contextlib import AsyncExitStack

_preferred_live_target: Optional[tuple[str, str]] = None


def _create_genai_client(location: Optional[str] = None) -> genai.Client:
    project = settings.google_cloud_project
    if not project:
        try:
            _, default_proj = google.auth.default()
            project = default_proj or ""
        except Exception:
            project = ""
    loc = location or settings.live_location or settings.google_cloud_location or "global"
    return genai.Client(
        vertexai=settings.google_genai_use_vertexai,
        project=project or None,
        location=loc,
    )


def _get_live_candidates() -> list[tuple[str, str]]:
    primary_loc = settings.live_location or "global"
    regional_loc = settings.google_cloud_location or "us-central1"
    primary_model = settings.live_model or "gemini-3.8-live"

    candidates: list[tuple[str, str]] = []
    if _preferred_live_target:
        candidates.append(_preferred_live_target)
    for item in [
        (primary_loc, primary_model),
        (regional_loc, primary_model),
        (regional_loc, "gemini-live-2.5-flash-native-audio"),
    ]:
        if item not in candidates:
            candidates.append(item)
    return candidates


def _build_live_config(
    problem: Problem,
    mode: str,
    resumption_handle: Optional[str] = None,
    persona_id: Optional[str] = None,
) -> types.LiveConnectConfig:
    persona = session_store.get_persona(persona_id)
    system_text = build_system_prompt(problem, mode, persona_id=persona.id)
    voice_name = persona.preferred_voice or settings.live_voice or "Puck"
    resumption_cfg = (
        types.SessionResumptionConfig(handle=resumption_handle)
        if resumption_handle
        else types.SessionResumptionConfig()
    )
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=system_text)]
        ),
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice_name
                )
            )
        ),
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                disabled=False,
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        context_window_compression=types.ContextWindowCompressionConfig(
            trigger_tokens=28000,
            sliding_window=types.SlidingWindow(target_tokens=16000),
        ),
        session_resumption=resumption_cfg,
        tools=get_tool_declarations(),
    )


async def handle_coach_websocket(websocket: WebSocket) -> None:
    if not verify_ws_token(websocket):
        await websocket.close(code=4401, reason="Unauthorized")
        return

    await websocket.accept()

    send_lock = asyncio.Lock()

    async def send_json(payload: dict[str, Any]) -> None:
        async with send_lock:
            try:
                await websocket.send_text(json.dumps(payload))
            except Exception:
                pass

    # Wait for initial `start` message (or default to P01 tutor if another message arrives first)
    problem_id = "P01"
    mode = "tutor"
    persona_id = "persona-student"
    session_id: Optional[str] = None
    first_queued_msg: Optional[dict[str, Any]] = None

    try:
        raw_first = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
        parsed = json.loads(raw_first)
        if parsed.get("type") == "start":
            problem_id = parsed.get("problem_id") or "P01"
            mode = parsed.get("mode") or "tutor"
            persona_id = parsed.get("persona_id") or "persona-student"
            session_id = parsed.get("session_id")
        else:
            first_queued_msg = parsed
    except Exception as e:
        await send_json(
            {"type": "status", "state": "error", "detail": f"Handshake failed: {e}"}
        )
        await websocket.close()
        return

    problem = problem_bank.get(problem_id) or problem_bank.list_all()[0]
    session_rec = session_store.create_or_get(
        problem_id=problem.id, mode=mode, session_id=session_id
    )
    allow_solution = mode == "review"
    last_snapshot_code = ""
    pending_client_tools: dict[str, asyncio.Future[dict[str, Any]]] = {}
    client_Outgoing_queue: asyncio.Queue[Optional[dict[str, Any]]] = asyncio.Queue()

    if first_queued_msg:
        await client_Outgoing_queue.put(first_queued_msg)

    stop_event = asyncio.Event()

    async def browser_reader_loop() -> None:
        nonlocal allow_solution, mode, problem
        try:
            while not stop_event.is_set():
                msg = await websocket.receive()
                if msg.get("type") == "websocket.disconnect":
                    stop_event.set()
                    await client_Outgoing_queue.put(None)
                    break

                if "bytes" in msg and msg["bytes"]:
                    b64 = base64.b64encode(msg["bytes"]).decode("ascii")
                    await client_Outgoing_queue.put({"type": "audio", "data": b64})
                    continue

                text_data = msg.get("text")
                if not text_data:
                    continue

                data = json.loads(text_data)
                mtype = data.get("type")

                if mtype == "tool_result":
                    call_id = str(data.get("call_id", ""))
                    fut = pending_client_tools.get(call_id)
                    if fut and not fut.done():
                        fut.set_result(data.get("result") or {})
                    continue

                if mtype == "text":
                    user_text = str(data.get("text", ""))
                    if "show solution" in user_text.lower():
                        allow_solution = True

                await client_Outgoing_queue.put(data)
        except WebSocketDisconnect:
            stop_event.set()
            await client_Outgoing_queue.put(None)
        except Exception as e:
            await send_json(
                {"type": "status", "state": "error", "detail": f"Reader error: {e}"}
            )
            stop_event.set()
            await client_Outgoing_queue.put(None)

    reader_task = asyncio.create_task(browser_reader_loop())

    try:
        global _preferred_live_target
        clients_by_loc: dict[str, genai.Client] = {}
        reconnect_attempts = 0

        while not stop_event.is_set() and reconnect_attempts < 5:
            config = _build_live_config(
                problem=problem,
                mode=mode,
                resumption_handle=session_rec.resumption_handle,
                persona_id=persona_id,
            )
            should_reconnect = False

            try:
                async with AsyncExitStack() as stack:
                    live_session = None
                    active_loc = settings.live_location or "global"
                    active_model = settings.live_model
                    last_conn_err: Optional[Exception] = None

                    for cand_loc, cand_model in _get_live_candidates():
                        if cand_loc not in clients_by_loc:
                            clients_by_loc[cand_loc] = _create_genai_client(cand_loc)
                        cand_client = clients_by_loc[cand_loc]
                        try:
                            live_session = await stack.enter_async_context(
                                cand_client.aio.live.connect(
                                    model=cand_model, config=config
                                )
                            )
                            active_loc = cand_loc
                            active_model = cand_model
                            _preferred_live_target = (cand_loc, cand_model)
                            break
                        except Exception as conn_err:
                            last_conn_err = conn_err
                            continue

                    if live_session is None:
                        raise last_conn_err or RuntimeError("Failed to connect to Gemini Live API")

                    reconnect_attempts = 0
                    await send_json(
                        {
                            "type": "status",
                            "state": "connected",
                            "detail": f"Connected to {active_model} [{active_loc}] ({mode} mode)",
                            "session_id": session_rec.session_id,
                            "problem_id": problem.id,
                            "mode": mode,
                        }
                    )

                    # Greet candidate on fresh session start
                    if not session_rec.resumption_handle:
                        active_persona = session_store.get_persona(persona_id)
                        intro_prompt = (
                            f"The learner ({active_persona.name}, {active_persona.role}) just opened problem {problem.id}: {problem.title} in {mode.upper()} mode. "
                            "Give a brief 1-2 sentence greeting tailored to their persona and mode, and invite them to state their initial thoughts."
                        )
                        await live_session.send_client_content(
                            turns=types.Content(
                                role="user",
                                parts=[types.Part.from_text(text=intro_prompt)],
                            ),
                            turn_complete=True,
                        )

                    session_closed = asyncio.Event()

                    async def forward_to_gemini() -> None:
                        nonlocal problem, mode, persona_id, allow_solution, last_snapshot_code, should_reconnect
                        while not stop_event.is_set() and not session_closed.is_set():
                            try:
                                item = await asyncio.wait_for(
                                    client_Outgoing_queue.get(), timeout=1.0
                                )
                            except asyncio.TimeoutError:
                                continue

                            if item is None:
                                break

                            itype = item.get("type")

                            if itype == "audio":
                                raw_b64 = item.get("data", "")
                                if raw_b64:
                                    pcm_bytes = base64.b64decode(raw_b64)
                                    await live_session.send_realtime_input(
                                        audio=types.Blob(
                                            data=pcm_bytes,
                                            mime_type="audio/pcm;rate=16000",
                                        )
                                    )

                            elif itype == "screen_frame":
                                jpeg_b64 = item.get("jpeg_b64", "")
                                if jpeg_b64:
                                    jpeg_bytes = base64.b64decode(jpeg_b64)
                                    await live_session.send_realtime_input(
                                        video=types.Blob(
                                            data=jpeg_bytes,
                                            mime_type="image/jpeg",
                                        )
                                    )

                            elif itype == "text":
                                text = str(item.get("text", "")).strip()
                                if text:
                                    await live_session.send_client_content(
                                        turns=types.Content(
                                            role="user",
                                            parts=[types.Part.from_text(text=text)],
                                        ),
                                        turn_complete=True,
                                    )

                            elif itype == "code_snapshot":
                                code = str(item.get("code", ""))
                                cursor_line = int(item.get("cursor_line", 1))
                                reason = str(item.get("reason", "idle"))
                                if code.strip() == last_snapshot_code.strip() and reason == "idle":
                                    continue
                                last_snapshot_code = code
                                session_rec.last_code = code
                                numbered = "\n".join(
                                    f"{idx+1:3d}: {line}"
                                    for idx, line in enumerate(code.splitlines())
                                )
                                snap_msg = (
                                    f"[EDITOR SNAPSHOT reason={reason} cursor_line={cursor_line}]\n"
                                    f"```python\n{numbered}\n```\n"
                                    "(Silent context update — do not speak unless helpful or a test run just completed.)"
                                )
                                await live_session.send_client_content(
                                    turns=types.Content(
                                        role="user",
                                        parts=[types.Part.from_text(text=snap_msg)],
                                    ),
                                    turn_complete=False,
                                )

                            elif itype == "test_results":
                                results = item.get("results") or []
                                all_passed = bool(item.get("all_passed", False))
                                kind = str(item.get("kind", "run"))
                                session_store.record_run(
                                    session_rec.session_id,
                                    all_passed=all_passed,
                                    kind=kind,
                                    results={"results": results, "all_passed": all_passed, "kind": kind},
                                )
                                summary_lines = []
                                for r in results[:8]:
                                    status_str = "PASS" if r.get("passed") else "FAIL"
                                    err_str = f" error={r.get('error')}" if r.get("error") else ""
                                    summary_lines.append(
                                        f"  Test #{r.get('idx', 0) + 1}: {status_str} "
                                        f"(got={r.get('got')}, expected={r.get('expected')}, {r.get('ms', 0)}ms){err_str}"
                                    )
                                result_context = (
                                    f"[TEST RESULTS kind={kind} all_passed={all_passed}]\n"
                                    + "\n".join(summary_lines)
                                    + "\nReact briefly: if a test failed, ask a Socratic question or guide them to the bug; "
                                    "if all passed, congratulate briefly and ask about time/space complexity or edge cases."
                                )
                                await live_session.send_client_content(
                                    turns=types.Content(
                                        role="user",
                                        parts=[types.Part.from_text(text=result_context)],
                                    ),
                                    turn_complete=True,
                                )

                            elif itype in ("control", "start"):
                                action = item.get("action") or (
                                    "switch_mode" if itype == "start" else ""
                                )
                                if action == "reveal_hint":
                                    lvl = item.get("level")
                                    res = await execute_server_tool(
                                        name="reveal_hint",
                                        args={"level": lvl} if lvl else {},
                                        session_id=session_rec.session_id,
                                        problem=problem,
                                        mode=mode,
                                        allow_solution=allow_solution,
                                        send_to_browser=send_json,
                                    )
                                    if "hint" in res:
                                        await live_session.send_client_content(
                                            turns=types.Content(
                                                role="user",
                                                parts=[
                                                    types.Part.from_text(
                                                        text=f"[HINT REVEALED level={res['level']}] {res['hint']}\nBriefly elaborate on this hint in 1-2 sentences."
                                                    )
                                                ],
                                            ),
                                            turn_complete=True,
                                        )
                                elif action in ("switch_mode", "next_problem", "switch_persona") or itype == "start":
                                    new_pid = item.get("problem_id") or problem.id
                                    new_mode = item.get("mode") or mode
                                    new_persona_id = item.get("persona_id") or persona_id
                                    new_prob = problem_bank.get(new_pid)
                                    if new_prob:
                                        problem = new_prob
                                    mode = new_mode
                                    persona_id = new_persona_id
                                    allow_solution = mode == "review"
                                    session_rec.problem_id = problem.id
                                    session_rec.mode = mode
                                    session_rec.persona_id = persona_id
                                    session_rec.resumption_handle = None
                                    should_reconnect = True
                                    session_closed.set()
                                    break
                                elif action == "end":
                                    stop_event.set()
                                    session_closed.set()
                                    break

                    async def receive_from_gemini() -> None:
                        nonlocal allow_solution, should_reconnect
                        while not stop_event.is_set() and not session_closed.is_set():
                            async for response in live_session.receive():
                                if stop_event.is_set() or session_closed.is_set():
                                    break

                                if response.session_resumption_update:
                                    upd = response.session_resumption_update
                                    if upd.resumable and upd.new_handle:
                                        session_rec.resumption_handle = upd.new_handle

                                if response.go_away is not None:
                                    should_reconnect = True
                                    await send_json(
                                        {
                                            "type": "status",
                                            "state": "reconnecting",
                                            "detail": "Refreshing Live session...",
                                        }
                                    )
                                    session_closed.set()
                                    break

                                sc = response.server_content
                                if sc:
                                    if sc.interrupted:
                                        await send_json({"type": "interrupted"})

                                    if sc.input_transcription and sc.input_transcription.text:
                                        utext = sc.input_transcription.text
                                        if "show solution" in utext.lower():
                                            allow_solution = True
                                        await send_json(
                                            {
                                                "type": "transcript",
                                                "role": "user",
                                                "text": utext,
                                                "final": bool(sc.input_transcription.finished),
                                            }
                                        )

                                    if sc.output_transcription and sc.output_transcription.text:
                                        await send_json(
                                            {
                                                "type": "transcript",
                                                "role": "coach",
                                                "text": sc.output_transcription.text,
                                                "final": bool(sc.output_transcription.finished),
                                            }
                                        )

                                    if sc.model_turn and sc.model_turn.parts:
                                        for part in sc.model_turn.parts:
                                            if (
                                                part.inline_data
                                                and part.inline_data.data
                                                and (part.inline_data.mime_type or "").startswith("audio/")
                                            ):
                                                b64_audio = base64.b64encode(
                                                    part.inline_data.data
                                                ).decode("ascii")
                                                await send_json(
                                                    {"type": "audio", "data": b64_audio}
                                                )

                                if response.tool_call and response.tool_call.function_calls:
                                    fn_responses: list[types.FunctionResponse] = []
                                    for fc in response.tool_call.function_calls:
                                        fname = fc.name or ""
                                        fargs = dict(fc.args or {})
                                        fid = fc.id or f"call-{ fname }"

                                        if fname in SERVER_SIDE_TOOLS:
                                            result_dict = await execute_server_tool(
                                                name=fname,
                                                args=fargs,
                                                session_id=session_rec.session_id,
                                                problem=problem,
                                                mode=mode,
                                                allow_solution=allow_solution,
                                                send_to_browser=send_json,
                                            )
                                        elif fname in CLIENT_SIDE_TOOLS:
                                            loop = asyncio.get_running_loop()
                                            fut: asyncio.Future[dict[str, Any]] = loop.create_future()
                                            pending_client_tools[fid] = fut
                                            await send_json(
                                                {
                                                    "type": "tool_call",
                                                    "call_id": fid,
                                                    "name": fname,
                                                    "args": fargs,
                                                }
                                            )
                                            try:
                                                result_dict = await asyncio.wait_for(
                                                    fut, timeout=8.0
                                                )
                                            except asyncio.TimeoutError:
                                                if fname == "get_editor_state":
                                                    result_dict = {
                                                        "code": session_rec.last_code,
                                                        "last_results": session_rec.last_results,
                                                    }
                                                else:
                                                    result_dict = {"status": "dispatched"}
                                            finally:
                                                pending_client_tools.pop(fid, None)
                                        else:
                                            result_dict = {"error": f"Unknown tool {fname}"}

                                        fn_responses.append(
                                            types.FunctionResponse(
                                                id=fid,
                                                name=fname,
                                                response=result_dict,
                                            )
                                        )

                                    if fn_responses:
                                        await live_session.send_tool_response(
                                            function_responses=fn_responses
                                        )

                    sender_task = asyncio.create_task(forward_to_gemini())
                    receiver_task = asyncio.create_task(receive_from_gemini())

                    done, pending = await asyncio.wait(
                        [sender_task, receiver_task],
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for p in pending:
                        p.cancel()
                    for d in done:
                        if d.exception() and not isinstance(
                            d.exception(), asyncio.CancelledError
                        ):
                            raise d.exception()  # type: ignore

            except Exception as e:
                if stop_event.is_set():
                    break
                reconnect_attempts += 1
                await send_json(
                    {
                        "type": "status",
                        "state": "reconnecting" if reconnect_attempts < 5 else "error",
                        "detail": f"Live API session interrupted ({e}), reconnecting...",
                    }
                )
                await asyncio.sleep(1.0)
                should_reconnect = True

            if not should_reconnect:
                break

    except Exception as e:
        traceback.print_exc()
        await send_json({"type": "status", "state": "error", "detail": str(e)})
    finally:
        stop_event.set()
        reader_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass
