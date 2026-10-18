import React, { useEffect, useState } from 'react';
import {
  ListFilter,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Briefcase,
  BookCheck,
  CheckCircle2,
  KeyRound,
  FileText,
  BookMarked,
} from 'lucide-react';
import {
  fetchConfig,
  fetchDashboardStats,
  fetchProblem,
  fetchProblems,
  fetchRevisionNotes,
} from './api';
import { CoachMode, useAppStore } from './store';
import { preloadRunner } from './runner/runTests';
import { coachSocket } from './coach/CoachSocket';
import { ProblemPane } from './components/ProblemPane';
import { ReferenceNotesPane } from './components/ReferenceNotesPane';
import { EditorPane } from './components/EditorPane';
import { ResultsPane } from './components/ResultsPane';
import { CoachPane } from './components/CoachPane';
import { ProblemList } from './components/ProblemList';
import { ScorecardModal } from './components/ScorecardModal';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const App: React.FC = () => {
  const {
    problems,
    currentProblem,
    mode,
    timerSecondsRemaining,
    timerRunning,
    solvedIds,
    targetFirm,
    leftPaneTab,
    revisionNotes,
    unreadNotesCount,
    setProblems,
    setCurrentProblem,
    setMode,
    startTimer,
    stopTimer,
    tickTimer,
    setShowProblemDrawer,
    setDashboardStats,
    setTargetFirm,
    setLeftPaneTab,
    setRevisionNotes,
  } = useAppStore();

  const [needsToken, setNeedsToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  const initializeApp = async () => {
    try {
      const cfg = await fetchConfig();
      if (cfg.target_firm) {
        setTargetFirm(cfg.target_firm);
      }
      const list = await fetchProblems();
      setProblems(list);
      if (list.length > 0) {
        const defaultId = list.find((p) => p.id === 'P02')?.id || list[0].id;
        const firstDetail = await fetchProblem(defaultId);
        setCurrentProblem(firstDetail);
      }
      const stats = await fetchDashboardStats();
      setDashboardStats(stats.solved_ids || [], stats.pattern_stats || {});
      try {
        const notes = await fetchRevisionNotes();
        setRevisionNotes(notes);
      } catch (e) {
        console.warn('Could not fetch server revision notes:', e);
      }
      setNeedsToken(false);
    } catch (err: any) {
      if (String(err?.message || '').includes('401')) {
        setNeedsToken(true);
      } else {
        console.error('Initialization error:', err);
      }
    }
  };

  useEffect(() => {
    preloadRunner();
    initializeApp();
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      tickTimer();
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, tickTimer]);

  const handleModeSwitch = (newMode: CoachMode) => {
    setMode(newMode);
    if (newMode === 'interview') {
      startTimer(45);
    } else {
      stopTimer();
    }
    if (currentProblem && coachSocket.isConnected) {
      coachSocket.switchContext(currentProblem.id, newMode);
    }
  };

  const handleAdjacentProblem = async (delta: number) => {
    if (!currentProblem || problems.length === 0) return;
    const idx = problems.findIndex((p) => p.id === currentProblem.id);
    if (idx < 0) return;
    const nextIdx = (idx + delta + problems.length) % problems.length;
    const nextId = problems[nextIdx].id;
    const detail = await fetchProblem(nextId);
    setCurrentProblem(detail);
    if (coachSocket.isConnected) {
      coachSocket.switchContext(detail.id, mode);
    }
  };

  const handleSaveAccessToken = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('livecoach_access_token', tokenInput.trim());
    initializeApp();
  };

  if (needsToken) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center p-4">
        <form
          onSubmit={handleSaveAccessToken}
          className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <KeyRound className="w-4 h-4" />
            <span>Enter LiveCoach Access Token</span>
          </div>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="ACCESS_TOKEN"
            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-white"
          />
          <button
            type="submit"
            className="w-full py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
          >
            Unlock LiveCoach
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Bar */}
      <header className="h-12 px-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-4 shrink-0">
        {/* Left: Brand & Problem Picker */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-xs">
              LC
            </div>
            <div>
              <div className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>LiveCoach</span>
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300">
                  {targetFirm} Prep
                </span>
              </div>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <button
            onClick={() => setShowProblemDrawer(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-100 transition"
          >
            <ListFilter className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono font-bold text-emerald-300">
              {currentProblem?.id || 'P02'}
            </span>
            <span className="max-w-[200px] truncate">
              {currentProblem?.title || 'Select Problem'}
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleAdjacentProblem(-1)}
              title="Previous Problem"
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleAdjacentProblem(1)}
              title="Next Problem"
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Center: Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          {[
            { id: 'tutor', label: 'Tutor (Socratic)', icon: GraduationCap },
            { id: 'interview', label: 'Interview (45m)', icon: Briefcase },
            { id: 'review', label: 'Review & Optimal', icon: BookCheck },
          ].map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleModeSwitch(m.id as CoachMode)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
                  active
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Reference Notes Tab Shortcut, Timer & Progress */}
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setLeftPaneTab(leftPaneTab === 'notes' ? 'problem' : 'notes')
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
              leftPaneTab === 'notes'
                ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reference Notes</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-900 text-emerald-300 font-mono">
              {revisionNotes.length}
            </span>
            {unreadNotesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500 text-slate-950 font-bold animate-pulse">
                +{unreadNotesCount}
              </span>
            )}
          </button>

          {timerSecondsRemaining !== null && (
            <button
              onClick={() =>
                timerRunning
                  ? stopTimer()
                  : startTimer(Math.ceil(timerSecondsRemaining / 60))
              }
              title="Click to pause/resume timer"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold border ${
                timerRunning
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {formatTimer(timerSecondsRemaining)}
            </button>
          )}

          <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {solvedIds.length}/{problems.length} Solved
            </span>
          </div>
        </div>
      </header>

      {/* Main 3-Pane Workspace */}
      <main className="flex-1 min-h-0 grid grid-cols-12">
        {/* Left Pane: Problem Statement | Reference Notes for Revision (3 cols) */}
        <div className="col-span-3 min-h-0 border-r border-slate-800 flex flex-col overflow-hidden">
          <div className="h-9 px-2 border-b border-slate-800 bg-slate-900 flex items-center gap-1 shrink-0">
            <button
              onClick={() => setLeftPaneTab('problem')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1 rounded text-xs font-semibold transition ${
                leftPaneTab === 'problem'
                  ? 'bg-slate-800 text-emerald-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Problem</span>
            </button>
            <button
              onClick={() => setLeftPaneTab('notes')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1 rounded text-xs font-semibold transition ${
                leftPaneTab === 'notes'
                  ? 'bg-slate-800 text-emerald-300 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5" />
              <span>Reference Notes</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950 text-emerald-400 font-mono">
                {revisionNotes.length}
              </span>
              {unreadNotesCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {leftPaneTab === 'problem' ? (
              <ProblemPane />
            ) : (
              <ReferenceNotesPane />
            )}
          </div>
        </div>

        {/* Center Pane: Editor + Runner Results (6 cols) */}
        <div className="col-span-6 min-h-0 flex flex-col overflow-hidden">
          <div className="h-[60%] min-h-0">
            <EditorPane />
          </div>
          <div className="h-[40%] min-h-0">
            <ResultsPane />
          </div>
        </div>

        {/* Right Pane: Gemini Live Voice Coach (3 cols) */}
        <div className="col-span-3 min-h-0 overflow-hidden">
          <CoachPane />
        </div>
      </main>

      {/* Modals / Drawers */}
      <ProblemList />
      <ScorecardModal />
    </div>
  );
};

export default App;
