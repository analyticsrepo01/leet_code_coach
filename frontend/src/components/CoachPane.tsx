import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  MonitorUp,
  Lightbulb,
  Send,
  Volume2,
  Video,
  Award,
  Sparkles,
  BookMarked,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../store';
import { coachSocket } from '../coach/CoachSocket';
import { requestHintApi, synthesizeRevisionNoteApi } from '../api';
import { LiveAvatarCoach } from './LiveAvatarCoach';

export const CoachPane: React.FC = () => {
  const {
    currentProblem,
    code,
    mode,
    coachEngine,
    setCoachEngine,
    wsStatus,
    wsDetail,
    micActive,
    coachSpeaking,
    screenShareActive,
    revealedHints,
    transcript,
    sessionId,
    addHint,
    scorecard,
    setShowScorecardModal,
    addOrUpdateRevisionNote,
    isSynthesizingNote,
    setIsSynthesizingNote,
    setLeftPaneTab,
    appendTranscript,
    activePersonaId,
    setActivePersonaId,
    setMode,
  } = useAppStore();

  const [inputText, setInputText] = useState('');
  const [isArgonThinking, setIsArgonThinking] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, isArgonThinking]);

  const isConnected = wsStatus === 'connected';
  const totalHints = currentProblem?.hints_total || 0;
  const nextHintLevel = revealedHints.length + 1;

  const handleRevealNextHint = async () => {
    if (!currentProblem || nextHintLevel > totalHints) return;
    if (coachSocket.isConnected) {
      coachSocket.requestHintViaWs(nextHintLevel);
    } else {
      try {
        const res = await requestHintApi(
          currentProblem.id,
          nextHintLevel,
          sessionId
        );
        addHint(res.level, res.text);
      } catch (e) {
        console.error('Failed to reveal hint:', e);
      }
    }
  };

  const runArgonChatPrompt = async (prompt: string) => {
    if (!prompt.trim()) return;
    setIsArgonThinking(true);
    try {
      await coachSocket.sendText(prompt);
    } finally {
      setIsArgonThinking(false);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isArgonThinking) return;
    const text = inputText;
    setInputText('');
    await runArgonChatPrompt(text);
  };

  const handleQuickSaveNote = async () => {
    if (!currentProblem || isSynthesizingNote) return;
    setIsSynthesizingNote(true);
    try {
      const note = await synthesizeRevisionNoteApi({
        problem_id: currentProblem.id,
        transcript: transcript.map((t) => ({ role: t.role, text: t.text })),
        code,
      });
      addOrUpdateRevisionNote(note, true);
      appendTranscript(
        'coach',
        `📓 Saved revision note: "${note.title}" (${note.category}) — view it in the Reference Notes tab.`
      );
      setLeftPaneTab('notes');
    } catch (e) {
      console.error('Failed to synthesize revision note:', e);
    } finally {
      setIsSynthesizingNote(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 border-l border-slate-800">
      {/* Coach Header & Controls */}
      <div className="p-3 border-b border-slate-800 bg-slate-900/80 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                  : wsStatus === 'connecting' || wsStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : wsStatus === 'error'
                  ? 'bg-rose-500'
                  : 'bg-slate-600'
              }`}
            />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5 flex-wrap">
                <span>Coach</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  gemini-4-argon
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  gemini-3.8-live
                </span>
              </div>
            </div>
            {coachSpeaking && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse">
                <Volume2 className="w-3 h-3" /> Speaking
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                setCoachEngine(
                  coachEngine === 'video_avatar' ? 'voice_proxy' : 'video_avatar'
                )
              }
              title="Toggle iCoach Live Talking Video Avatar"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition ${
                coachEngine === 'video_avatar'
                  ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Avatar</span>
            </button>

            {scorecard && (
              <button
                onClick={() => setShowScorecardModal(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
              >
                <Award className="w-3.5 h-3.5" /> Scorecard
              </button>
            )}
          </div>
        </div>

        {/* Voice / Mic / Screen Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isConnected ? (
            <button
              onClick={() => coachSocket.connect()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              Connect Voice Coach
            </button>
          ) : (
            <button
              onClick={() => coachSocket.disconnect()}
              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-rose-600/80 hover:bg-rose-600 text-white transition"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              End
            </button>
          )}

          <button
            onClick={() => coachSocket.toggleMic()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition ${
              micActive
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            {micActive ? (
              <>
                <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                Mic On (Thinking Aloud)
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-slate-400" />
                Mic Off
              </>
            )}
          </button>

          <button
            onClick={() => coachSocket.toggleScreenShare()}
            title="Share screen at 1 fps JPEG for whiteboard/diagrams"
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition ${
              screenShareActive
                ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MonitorUp className="w-3.5 h-3.5" />
            <span>1fps</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-400 truncate">{wsDetail}</div>
      </div>

      {/* Optional Live Video Avatar Panel (from live_bank iCoach) */}
      {coachEngine === 'video_avatar' && <LiveAvatarCoach />}

      {/* Progressive Hint Ladder */}
      {totalHints > 0 && (
        <div className="p-3 border-b border-slate-800 bg-slate-900/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              Hint Ladder ({revealedHints.length}/{totalHints})
            </span>
            {nextHintLevel <= totalHints && (
              <button
                onClick={handleRevealNextHint}
                className="px-2.5 py-1 rounded text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition"
              >
                Reveal Hint #{nextHintLevel}
              </button>
            )}
          </div>

          {revealedHints.length > 0 && (
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {revealedHints.map((h) => (
                <div
                  key={h.level}
                  className="text-xs rounded bg-amber-950/30 border border-amber-500/25 px-2.5 py-1.5 text-amber-100"
                >
                  <span className="font-bold text-amber-400 mr-1.5">
                    L{h.level}:
                  </span>
                  {h.text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transcript Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {transcript.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-slate-500 space-y-2">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            <p className="text-slate-300 font-semibold">
              Gemini 4 Argon Chat + Live Voice Coach
            </p>
            <p>
              Type below to solve &amp; debug with{' '}
              <strong className="text-indigo-300">Gemini 4 Argon</strong>{' '}
              (deep reasoning), and click <strong>Connect Voice Coach</strong>{' '}
              to have <strong className="text-emerald-300">Gemini Live</strong>{' '}
              speak and coach you around it out loud.
            </p>
          </div>
        ) : (
          transcript.map((item) => {
            const isArgon = item.text.startsWith('🧠 [Gemini 4 Argon]');
            const displayText = isArgon
              ? item.text.replace('🧠 [Gemini 4 Argon] ', '')
              : item.text;
            return (
              <div
                key={item.id}
                className={`flex flex-col ${
                  item.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <span className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 px-1 flex items-center gap-1">
                  {item.role === 'user'
                    ? 'You'
                    : isArgon
                    ? '🧠 Gemini 4 Argon'
                    : '🎙️ Gemini Live Voice'}
                </span>
                <div
                  className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                    item.role === 'user'
                      ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-100'
                      : isArgon
                      ? 'bg-indigo-950/35 border border-indigo-500/30 text-slate-100'
                      : 'bg-slate-900 border border-slate-800 text-slate-200'
                  }`}
                >
                  {displayText}
                </div>
              </div>
            );
          })
        )}
        {isArgonThinking && (
          <div className="flex items-center gap-2 text-xs text-indigo-300 px-2 py-1.5 rounded bg-indigo-950/30 border border-indigo-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>Gemini 4 Argon is analyzing problem &amp; code...</span>
          </div>
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="px-3 py-1.5 border-t border-slate-800/80 bg-slate-900/40 flex items-center gap-1.5 overflow-x-auto">
        <button
          onClick={() => {
            if (activePersonaId !== 'persona-ml-interviewer') {
              setActivePersonaId('persona-ml-interviewer');
              setMode('interview');
            }
            runArgonChatPrompt(
              'Ask me one realistic ML / LLM interview question right now. After I answer, grade my answer, give me concrete suggestions to improve, and save a note of my answer and feedback.'
            );
          }}
          disabled={isArgonThinking}
          title="Switch to ML Mock Interviewer & get asked an ML interview question"
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-indigo-600/25 hover:bg-indigo-600/35 text-indigo-200 border border-indigo-500/40 disabled:opacity-50"
        >
          <span>🎯 Ask ML Question</span>
        </button>
        <button
          onClick={() => {
            if (activePersonaId !== 'persona-ml-interviewer') {
              setActivePersonaId('persona-ml-interviewer');
            }
            runArgonChatPrompt(
              'Please evaluate my last answer: give me a score out of 10, note what I got right, give concrete suggestions to improve my answer, show a crisp model answer, and save this Q&A feedback into my Reference Notes.'
            );
          }}
          disabled={isArgonThinking}
          title="Grade your last answer, get suggestions to improve, and save to Reference Notes"
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 border border-violet-500/30 disabled:opacity-50"
        >
          <span>📝 Grade &amp; Note My Answer</span>
        </button>
        <button
          onClick={handleQuickSaveNote}
          disabled={isSynthesizingNote}
          title="Synthesize concepts from your voice/chat discussion into the Reference Notes tab"
          className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 disabled:opacity-50"
        >
          {isSynthesizingNote ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <BookMarked className="w-3 h-3" />
          )}
          <span>Save Concept Note</span>
        </button>
        <button
          onClick={() =>
            runArgonChatPrompt(
              'Can you check my current code and highlight any suspicious line?'
            )
          }
          className="shrink-0 px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
        >
          Highlight bug line
        </button>
        <button
          onClick={() =>
            runArgonChatPrompt(
              'Ask me about the time and space complexity and edge cases.'
            )
          }
          className="shrink-0 px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
        >
          Probe Big-O &amp; edge cases
        </button>
        {mode === 'interview' && (
          <button
            onClick={() =>
              coachSocket.sendText(
                'Please conclude the interview and call submit_scorecard with my full evaluation.'
              )
            }
            className="shrink-0 px-2 py-1 rounded text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
          >
            Finish &amp; Score Interview
          </button>
        )}
      </div>

      {/* Chat Input */}
      <form
        onSubmit={handleSendText}
        className="p-2.5 border-t border-slate-800 bg-slate-900 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder='Ask Gemini 4 Argon or type "show solution"...'
          className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={isArgonThinking}
          className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
