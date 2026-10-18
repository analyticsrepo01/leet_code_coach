import React, { useEffect, useRef, useState } from 'react';
import '../avatar/gemini-avatar';
import { fetchVertexToken, requestHintApi } from '../api';
import { useAppStore } from '../store';
import { handleClientToolCall } from '../coach/clientTools';
import { coachSocket } from '../coach/CoachSocket';

const AVATAR_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'highlight_line',
        description:
          'Highlight a line range in the candidate code editor with a coaching note.',
        parameters: {
          type: 'OBJECT',
          properties: {
            line_start: { type: 'INTEGER', description: '1-based start line' },
            line_end: { type: 'INTEGER', description: '1-based end line' },
            note: { type: 'STRING', description: 'Short coaching question or note' },
          },
          required: ['line_start', 'line_end', 'note'],
        },
      },
      {
        name: 'run_tests',
        description: 'Run the candidate code against the Pyodide test suite.',
        parameters: {
          type: 'OBJECT',
          properties: {
            hidden: { type: 'BOOLEAN', description: 'Include hidden tests' },
          },
        },
      },
      {
        name: 'reveal_hint',
        description: 'Reveal the next hint level in the Hint Ladder.',
        parameters: {
          type: 'OBJECT',
          properties: {
            level: { type: 'INTEGER', description: '1-based hint level' },
          },
          required: ['level'],
        },
      },
    ],
  },
];

export const LiveAvatarCoach: React.FC = () => {
  const avatarRef = useRef<any>(null);
  const {
    currentProblem,
    mode,
    avatarName,
    setAvatarName,
    appendTranscript,
    addHint,
    sessionId,
  } = useAppStore();

  const [isStarting, setIsStarting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const startAvatar = async () => {
    if (!avatarRef.current || isStarting) return;
    setIsStarting(true);
    setErrorMsg(null);
    try {
      await customElements.whenDefined('gemini-avatar');
      const tokenData = await fetchVertexToken(currentProblem?.id, mode);
      const avatar = avatarRef.current;

      avatar.setAttribute('project-id', tokenData.project_id);
      avatar.setAttribute('access-token', tokenData.access_token);
      avatar.setAttribute('avatar-name', avatarName);
      avatar.setAttribute('voice', tokenData.avatar_voice || 'kore');
      avatar.setAttribute(
        'model',
        tokenData.avatar_model || 'gemini-3.1-flash-live-preview-04-2026'
      );
      avatar.setAttribute('language', 'en-US');
      avatar.setAttribute('location', tokenData.location || 'us-central1');
      avatar.setAttribute('output-mode', 'video');
      avatar.setAttribute('audio-chunk-size', '2048');
      avatar.setAttribute('enable-chroma-key', 'true');
      avatar.setAttribute('enable-transcript', 'true');
      avatar.setAttribute('enable-chat-input', 'false');
      avatar.setAttribute('enable-grounding', 'false');
      avatar.tools = AVATAR_TOOLS;

      if (tokenData.system_instruction) {
        avatar.setAttribute('system-instruction', tokenData.system_instruction);
      }
      avatar.setAttribute(
        'default-greeting',
        `Hi! I'm your LiveCoach for ${currentProblem?.title || 'this problem'}. Walk me through your initial approach!`
      );
      avatar.setAttribute('mic-auto-request', 'false');

      if (typeof avatar.start === 'function') {
        await avatar.start();
        setTimeout(() => {
          avatar.setAttribute('mic-auto-request', 'true');
          setIsConnected(true);
          setIsStarting(false);
        }, 1500);
      }

      coachSocket.registerAvatarForwarder((txt: string) => {
        if (avatar?.client && typeof avatar.client.sendText === 'function') {
          avatar.client.sendText(txt);
        }
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to start Live Avatar');
      setIsStarting(false);
      setIsConnected(false);
    }
  };

  const stopAvatar = () => {
    coachSocket.registerAvatarForwarder(null);
    const avatar = avatarRef.current;
    if (avatar && typeof avatar.stop === 'function') {
      try {
        avatar.stop();
      } catch {}
    }
    setIsConnected(false);
    setIsStarting(false);
  };

  useEffect(() => {
    const avatar = avatarRef.current;
    if (!avatar) return;

    const onTranscript = (e: any) => {
      const sender = e.detail?.sender === 'user' ? 'user' : 'coach';
      const text = e.detail?.text || '';
      if (text) appendTranscript(sender, text);
    };

    const onToolCall = async (e: any) => {
      const calls = e.detail?.functionCalls || [];
      const responses: any[] = [];
      for (const call of calls) {
        if (call.name === 'reveal_hint' && currentProblem) {
          const lvl = Number(call.args?.level || 1);
          const h = await requestHintApi(currentProblem.id, lvl, sessionId);
          addHint(h.level, h.text);
          responses.push({ id: call.id, response: { output: h.text } });
        } else {
          const out = await handleClientToolCall(call.name, call.args || {});
          responses.push({ id: call.id, response: { output: out } });
        }
      }
      if (responses.length > 0 && typeof avatar.sendToolResponse === 'function') {
        avatar.sendToolResponse(responses);
      }
    };

    avatar.addEventListener('transcript-item', onTranscript);
    avatar.addEventListener('tool-call', onToolCall);
    return () => {
      avatar.removeEventListener('transcript-item', onTranscript);
      avatar.removeEventListener('tool-call', onToolCall);
    };
  }, [currentProblem, sessionId, appendTranscript, addHint]);

  useEffect(() => {
    return () => stopAvatar();
  }, []);

  return (
    <div className="border-b border-slate-800 bg-slate-900/70 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
            iCoach Live Video Avatar
          </span>
          <select
            value={avatarName}
            onChange={(e) => setAvatarName(e.target.value)}
            disabled={isConnected || isStarting}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200"
          >
            <option value="Kira">Kira</option>
            <option value="Ben">Ben</option>
            <option value="Hana">Hana</option>
            <option value="Paul">Paul</option>
          </select>
        </div>
        {!isConnected ? (
          <button
            onClick={startAvatar}
            disabled={isStarting}
            className="px-2.5 py-1 rounded text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
          >
            {isStarting ? 'Starting Avatar...' : 'Start Video Avatar'}
          </button>
        ) : (
          <button
            onClick={stopAvatar}
            className="px-2.5 py-1 rounded text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white"
          >
            Stop Avatar
          </button>
        )}
      </div>

      <div className="relative w-full h-44 rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
        {React.createElement('gemini-avatar', {
          ref: avatarRef,
          id: 'livecoach-avatar',
          size: '170px',
          'avatar-name': avatarName,
          position: 'static',
          debug: 'false',
          style: {
            width: '100%',
            height: '100%',
            display: 'block',
          },
        })}
        {isStarting && (
          <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center text-xs text-emerald-300">
            Connecting Gemini Live Video Avatar...
          </div>
        )}
      </div>
      {errorMsg && (
        <p className="mt-1.5 text-xs text-rose-400">{errorMsg}</p>
      )}
    </div>
  );
};
