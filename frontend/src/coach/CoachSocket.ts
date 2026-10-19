import { fetchProblem, sendArgonChatApi, TestCaseResult } from '../api';
import { CoachMode, useAppStore } from '../store';
import { coachAudio } from './audio';
import { handleClientToolCall } from './clientTools';
import { screenShare } from './screen';

class CoachSocketManager {
  private ws: WebSocket | null = null;
  private lastSentCode = '';
  private avatarTextForwarder: ((text: string) => void) | null = null;

  public registerAvatarForwarder(fn: ((text: string) => void) | null): void {
    this.avatarTextForwarder = fn;
  }

  public get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public connect(problemId?: string, mode?: CoachMode): void {
    const store = useAppStore.getState();
    const targetProblemId = problemId || store.currentProblem?.id || 'P01';
    const targetMode = mode || store.mode || 'tutor';

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('livecoach_access_token') || '';
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${proto}//${window.location.host}/ws/coach${qs}`;

    store.setWsStatus('connecting', 'Connecting to Gemini Live...');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.sendJson({
        type: 'start',
        problem_id: targetProblemId,
        mode: targetMode,
        persona_id: store.activePersonaId,
        session_id: store.sessionId,
      });
      // Send initial code snapshot after short delay
      setTimeout(() => {
        const curStore = useAppStore.getState();
        if (curStore.code) {
          this.sendCodeSnapshot(curStore.code, curStore.cursorLine, 'idle');
        }
      }, 600);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.handleServerMessage(data);
      } catch (err) {
        console.error('[CoachSocket] Invalid server message:', err);
      }
    };

    ws.onerror = () => {
      useAppStore
        .getState()
        .setWsStatus('error', 'WebSocket connection error');
    };

    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        coachAudio.stopMic();
        screenShare.stop();
        useAppStore
          .getState()
          .setWsStatus('disconnected', 'Voice session disconnected');
      }
    };
  }

  public disconnect(): void {
    coachAudio.stopMic();
    coachAudio.flushPlayer();
    screenShare.stop();
    if (this.ws) {
      this.sendJson({ type: 'control', action: 'end' });
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    useAppStore.getState().setWsStatus('disconnected', 'Disconnected');
  }

  public async toggleMic(): Promise<void> {
    const store = useAppStore.getState();
    if (store.micActive) {
      coachAudio.stopMic();
      return;
    }
    if (!this.isConnected) {
      this.connect();
      await new Promise((r) => setTimeout(r, 500));
    }
    await coachAudio.startMic((b64) => {
      this.sendJson({ type: 'audio', data: b64 });
    });
  }

  public async toggleScreenShare(): Promise<void> {
    const store = useAppStore.getState();
    if (store.screenShareActive) {
      screenShare.stop();
      return;
    }
    if (!this.isConnected) {
      this.connect();
    }
    await screenShare.start((jpegB64) => {
      this.sendJson({ type: 'screen_frame', jpeg_b64: jpegB64 });
    });
  }

  public async sendText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const store = useAppStore.getState();
    store.appendTranscript('user', trimmed);

    try {
      const res = await sendArgonChatApi({
        problem_id: store.currentProblem?.id || 'P01',
        mode: store.mode,
        message: trimmed,
        code: store.code,
        cursor_line: store.cursorLine,
        test_results: store.testResults,
        transcript: store.transcript.map((t) => ({
          role: t.role,
          text: t.text,
        })),
        session_id: store.sessionId,
        persona_id: store.activePersonaId,
      });

      store.appendTranscript('coach', `🧠 [Gemini 4 Argon] ${res.reply}`);

      if (res.highlight) {
        store.setHighlight(res.highlight);
      }
      if (res.revealed_hint) {
        store.addHint(res.revealed_hint.level, res.revealed_hint.text);
      }
      if (res.saved_note) {
        store.addOrUpdateRevisionNote(res.saved_note, true);
      }

      // If Live Voice or Video Avatar is connected, have it speak around Argon's written answer
      const voicePrompt = `[ARGON CHAT SUMMARY] ${res.voice_summary}\nSpeak this summary naturally in 1-2 sentences to guide the candidate around Gemini 4 Argon's written answer in the chat.`;
      if (this.avatarTextForwarder) {
        this.avatarTextForwarder(voicePrompt);
      }
      if (this.isConnected) {
        this.sendJson({ type: 'text', text: voicePrompt });
      }
    } catch (err) {
      console.error('Argon chat fallback to Live WS:', err);
      if (this.avatarTextForwarder) {
        this.avatarTextForwarder(trimmed);
      }
      if (!this.isConnected) {
        this.connect();
        setTimeout(() => {
          this.sendJson({ type: 'text', text: trimmed });
        }, 700);
        return;
      }
      this.sendJson({ type: 'text', text: trimmed });
    }
  }

  public sendCodeSnapshot(
    code: string,
    cursorLine: number,
    reason: 'idle' | 'run' | 'submit'
  ): void {
    if (reason === 'idle' && code.trim() === this.lastSentCode.trim()) {
      return;
    }
    this.lastSentCode = code;
    if (this.avatarTextForwarder && reason !== 'idle') {
      this.avatarTextForwarder(
        `[EDITOR SNAPSHOT reason=${reason}]\n${code}`
      );
    }
    if (!this.isConnected) return;
    this.sendJson({
      type: 'code_snapshot',
      code,
      cursor_line: cursorLine,
      reason,
    });
  }

  public sendTestResults(
    results: TestCaseResult[],
    allPassed: boolean,
    kind: 'run' | 'submit'
  ): void {
    if (this.avatarTextForwarder) {
      const summary = results
        .slice(0, 5)
        .map(
          (r) =>
            `Test #${r.idx + 1}: ${r.passed ? 'PASS' : 'FAIL'} (got=${JSON.stringify(
              r.got
            )}, expected=${JSON.stringify(r.expected)})${
              r.error ? ' err=' + r.error : ''
            }`
        )
        .join('\n');
      this.avatarTextForwarder(
        `[TEST RESULTS kind=${kind} all_passed=${allPassed}]\n${summary}`
      );
    }
    if (!this.isConnected) return;
    this.sendJson({
      type: 'test_results',
      results,
      all_passed: allPassed,
      kind,
    });
  }

  public switchContext(
    problemId: string,
    mode: CoachMode,
    personaId?: string
  ): void {
    if (!this.isConnected) return;
    coachAudio.flushPlayer();
    this.sendJson({
      type: 'control',
      action: 'switch_mode',
      problem_id: problemId,
      mode,
      persona_id: personaId || useAppStore.getState().activePersonaId,
    });
  }

  public requestHintViaWs(level?: number): void {
    if (!this.isConnected) return;
    this.sendJson({
      type: 'control',
      action: 'reveal_hint',
      level,
    });
  }

  private sendJson(payload: Record<string, any>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private async handleServerMessage(msg: Record<string, any>): Promise<void> {
    const store = useAppStore.getState();
    const mtype = msg.type;

    if (mtype === 'status') {
      store.setWsStatus(msg.state || 'connected', msg.detail, msg.session_id);
      return;
    }

    if (mtype === 'interrupted') {
      coachAudio.flushPlayer();
      return;
    }

    if (mtype === 'audio' && msg.data) {
      await coachAudio.enqueueAudioBase64(msg.data);
      return;
    }

    if (mtype === 'transcript' && msg.text) {
      store.appendTranscript(
        msg.role === 'user' ? 'user' : 'coach',
        String(msg.text)
      );
      return;
    }

    if (mtype === 'hint') {
      store.addHint(Number(msg.level || 1), String(msg.text || ''));
      return;
    }

    if (mtype === 'score' && msg.scorecard) {
      store.setScorecard(msg.scorecard, true);
      return;
    }

    if (mtype === 'note_saved' && msg.note) {
      store.addOrUpdateRevisionNote(msg.note, true);
      store.appendTranscript(
        'coach',
        `[Saved Reference Note: "${msg.note.title}" in Reference Notes tab]`
      );
      return;
    }

    if (mtype === 'argon_chat' && msg.reply) {
      store.appendTranscript('coach', `🧠 [Gemini 4 Argon] ${msg.reply}`);
      if (msg.highlight) {
        store.setHighlight(msg.highlight);
      }
      if (msg.revealed_hint) {
        store.addHint(msg.revealed_hint.level, msg.revealed_hint.text);
      }
      if (msg.saved_note) {
        store.addOrUpdateRevisionNote(msg.saved_note, true);
      }
      return;
    }

    if (mtype === 'next_problem' && msg.problem?.id) {
      try {
        const detail = await fetchProblem(msg.problem.id);
        store.setCurrentProblem(detail);
      } catch (e) {
        console.error('Failed to load next problem:', e);
      }
      return;
    }

    if (mtype === 'tool_call') {
      const callId = String(msg.call_id || '');
      const name = String(msg.name || '');
      const args = msg.args || {};
      const result = await handleClientToolCall(name, args);
      this.sendJson({
        type: 'tool_result',
        call_id: callId,
        name,
        result,
      });
    }
  }
}

export const coachSocket = new CoachSocketManager();
