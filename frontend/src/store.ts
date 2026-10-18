import { create } from 'zustand';
import {
  ProblemDetail,
  ProblemListItem,
  ScorecardData,
  TestCaseResult,
} from './api';

export type CoachMode = 'tutor' | 'interview' | 'review';
export type CoachEngine = 'voice_proxy' | 'video_avatar';

export interface TranscriptItem {
  id: string;
  role: 'user' | 'coach' | 'system';
  text: string;
  timestamp: number;
}

export interface LineHighlight {
  line_start: number;
  line_end: number;
  note: string;
}

interface AppState {
  problems: ProblemListItem[];
  currentProblem: ProblemDetail | null;
  code: string;
  cursorLine: number;
  mode: CoachMode;
  coachEngine: CoachEngine;
  avatarName: string;

  sessionId: string;
  wsStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  wsDetail: string;
  micActive: boolean;
  coachSpeaking: boolean;
  screenShareActive: boolean;

  runnerReady: boolean;
  isRunningTests: boolean;
  testResults: TestCaseResult[];
  lastRunKind: 'run' | 'submit' | null;
  allPassed: boolean | null;

  revealedHints: Array<{ level: number; text: string }>;
  highlight: LineHighlight | null;
  transcript: TranscriptItem[];

  timerSecondsRemaining: number | null;
  timerRunning: boolean;

  scorecard: ScorecardData | null;
  showScorecardModal: boolean;
  showProblemDrawer: boolean;

  solvedIds: string[];
  patternStats: Record<
    string,
    { attempts: number; solved: number; hints: number; failed_runs: number }
  >;
  targetFirm: string;

  setProblems: (problems: ProblemListItem[]) => void;
  setCurrentProblem: (problem: ProblemDetail) => void;
  setCode: (code: string) => void;
  setCursorLine: (line: number) => void;
  setMode: (mode: CoachMode) => void;
  setCoachEngine: (engine: CoachEngine) => void;
  setAvatarName: (name: string) => void;
  setWsStatus: (
    status: AppState['wsStatus'],
    detail?: string,
    sessionId?: string
  ) => void;
  setMicActive: (active: boolean) => void;
  setCoachSpeaking: (speaking: boolean) => void;
  setScreenShareActive: (active: boolean) => void;
  setRunnerReady: (ready: boolean) => void;
  setIsRunningTests: (running: boolean) => void;
  setTestResults: (
    results: TestCaseResult[],
    allPassed: boolean,
    kind: 'run' | 'submit'
  ) => void;
  addHint: (level: number, text: string) => void;
  setHighlight: (highlight: LineHighlight | null) => void;
  appendTranscript: (role: 'user' | 'coach' | 'system', text: string) => void;
  clearTranscript: () => void;
  startTimer: (minutes: number) => void;
  stopTimer: () => void;
  tickTimer: () => void;
  setScorecard: (scorecard: ScorecardData | null, openModal?: boolean) => void;
  setShowScorecardModal: (show: boolean) => void;
  setShowProblemDrawer: (show: boolean) => void;
  setDashboardStats: (
    solvedIds: string[],
    patternStats: AppState['patternStats']
  ) => void;
  setTargetFirm: (firm: string) => void;
  resetCodeToStarter: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  problems: [],
  currentProblem: null,
  code: '',
  cursorLine: 1,
  mode: 'tutor',
  coachEngine: 'voice_proxy',
  avatarName: 'Kira',

  sessionId: `sess-${Math.random().toString(36).slice(2, 10)}`,
  wsStatus: 'disconnected',
  wsDetail: 'Click Connect Voice Coach to start',
  micActive: false,
  coachSpeaking: false,
  screenShareActive: false,

  runnerReady: false,
  isRunningTests: false,
  testResults: [],
  lastRunKind: null,
  allPassed: null,

  revealedHints: [],
  highlight: null,
  transcript: [],

  timerSecondsRemaining: null,
  timerRunning: false,

  scorecard: null,
  showScorecardModal: false,
  showProblemDrawer: false,

  solvedIds: [],
  patternStats: {},
  targetFirm: 'Quant & AI Research',

  setProblems: (problems) => set({ problems }),

  setCurrentProblem: (problem) => {
    const saved = localStorage.getItem(`livecoach_code_${problem.id}`);
    set({
      currentProblem: problem,
      code: saved !== null ? saved : problem.starter_code || '',
      cursorLine: 1,
      testResults: [],
      lastRunKind: null,
      allPassed: null,
      revealedHints: [],
      highlight: null,
    });
  },

  setCode: (code) => {
    const cur = get().currentProblem;
    if (cur) {
      localStorage.setItem(`livecoach_code_${cur.id}`, code);
    }
    set({ code });
  },

  setCursorLine: (cursorLine) => set({ cursorLine }),
  setMode: (mode) => set({ mode }),
  setCoachEngine: (coachEngine) => set({ coachEngine }),
  setAvatarName: (avatarName) => set({ avatarName }),

  setWsStatus: (wsStatus, wsDetail, sessionId) =>
    set((state) => ({
      wsStatus,
      wsDetail: wsDetail !== undefined ? wsDetail : state.wsDetail,
      sessionId: sessionId || state.sessionId,
    })),

  setMicActive: (micActive) => set({ micActive }),
  setCoachSpeaking: (coachSpeaking) => set({ coachSpeaking }),
  setScreenShareActive: (screenShareActive) => set({ screenShareActive }),
  setRunnerReady: (runnerReady) => set({ runnerReady }),
  setIsRunningTests: (isRunningTests) => set({ isRunningTests }),

  setTestResults: (testResults, allPassed, lastRunKind) =>
    set((state) => {
      const nextSolved =
        lastRunKind === 'submit' &&
        allPassed &&
        state.currentProblem &&
        !state.solvedIds.includes(state.currentProblem.id)
          ? [...state.solvedIds, state.currentProblem.id]
          : state.solvedIds;
      return {
        testResults,
        allPassed,
        lastRunKind,
        solvedIds: nextSolved,
      };
    }),

  addHint: (level, text) =>
    set((state) => {
      if (state.revealedHints.some((h) => h.level === level)) {
        return state;
      }
      const next = [...state.revealedHints, { level, text }].sort(
        (a, b) => a.level - b.level
      );
      return { revealedHints: next };
    }),

  setHighlight: (highlight) => set({ highlight }),

  appendTranscript: (role, text) =>
    set((state) => {
      const trimmed = text;
      if (!trimmed) return state;
      const list = [...state.transcript];
      const last = list[list.length - 1];
      // Merge streaming speech fragments from the same role if within 4 seconds
      if (
        last &&
        last.role === role &&
        role !== 'system' &&
        Date.now() - last.timestamp < 4000
      ) {
        const sep =
          last.text.endsWith(' ') || trimmed.startsWith(' ') ? '' : ' ';
        list[list.length - 1] = {
          ...last,
          text: `${last.text}${sep}${trimmed}`,
          timestamp: Date.now(),
        };
        return { transcript: list };
      }
      return {
        transcript: [
          ...list,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role,
            text: trimmed.trim(),
            timestamp: Date.now(),
          },
        ],
      };
    }),

  clearTranscript: () => set({ transcript: [] }),

  startTimer: (minutes) =>
    set({
      timerSecondsRemaining: Math.max(1, Math.round(minutes * 60)),
      timerRunning: true,
    }),

  stopTimer: () => set({ timerRunning: false }),

  tickTimer: () =>
    set((state) => {
      if (!state.timerRunning || state.timerSecondsRemaining === null) {
        return state;
      }
      if (state.timerSecondsRemaining <= 1) {
        return { timerSecondsRemaining: 0, timerRunning: false };
      }
      return { timerSecondsRemaining: state.timerSecondsRemaining - 1 };
    }),

  setScorecard: (scorecard, openModal = true) =>
    set({ scorecard, showScorecardModal: openModal }),

  setShowScorecardModal: (showScorecardModal) => set({ showScorecardModal }),
  setShowProblemDrawer: (showProblemDrawer) => set({ showProblemDrawer }),

  setDashboardStats: (solvedIds, patternStats) =>
    set({ solvedIds, patternStats }),

  setTargetFirm: (targetFirm) => set({ targetFirm }),

  resetCodeToStarter: () => {
    const cur = get().currentProblem;
    if (!cur) return;
    localStorage.removeItem(`livecoach_code_${cur.id}`);
    set({ code: cur.starter_code || '', highlight: null });
  },
}));
