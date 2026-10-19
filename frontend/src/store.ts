import { create } from 'zustand';
import {
  ProblemDetail,
  ProblemListItem,
  RevisionNoteItem,
  ScorecardData,
  TestCaseResult,
  UserPersonaItem,
} from './api';

export type CoachMode = 'tutor' | 'interview' | 'review';
export type CoachEngine = 'voice_proxy' | 'video_avatar';
export type LeftPaneTab = 'problem' | 'notes';

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

const NOTES_STORAGE_KEY = 'livecoach_revision_notes_v1';
const PERSONAS_STORAGE_KEY = 'livecoach_personas_v1';
const ACTIVE_PERSONA_KEY = 'livecoach_active_persona_id';

export const DEFAULT_PERSONAS: UserPersonaItem[] = [
  {
    id: 'persona-student',
    name: 'CS Student (Grade 14 / College)',
    avatar_emoji: '🎓',
    role: 'Grade 14 / Undergrad CS Student',
    experience_level: 'intermediate',
    coding_background:
      'Studying Computer Science fundamentals in Python: arrays, strings, hash maps, two pointers, binary search, recursion, BFS/DFS graphs, and dynamic programming.',
    coaching_style:
      'Patient, encouraging mentor. Walk through small dry-run examples step-by-step, build visual intuition before writing code, explain Big-O clearly, and ask friendly Socratic questions.',
    preferred_mode: 'tutor',
    preferred_voice: 'Puck',
    preferred_track: 'cs',
    preferred_difficulty: 'all',
    preferred_theme: 'dark',
    is_builtin: true,
  },
  {
    id: 'persona-beginner',
    name: 'Beginner / First-Time Coder',
    avatar_emoji: '🌱',
    role: 'New to Python & Algorithms',
    experience_level: 'beginner',
    coding_background:
      'Learning Python syntax (loops, lists, dictionaries, sets, functions) and basic algorithmic thinking from scratch.',
    coaching_style:
      'Super supportive, zero-jargon teacher. Explain Python syntax and built-in methods clearly with tiny 3-line examples, celebrate small wins, and guide one small step at a time.',
    preferred_mode: 'tutor',
    preferred_voice: 'Puck',
    preferred_track: 'cs',
    preferred_difficulty: 'easy',
    preferred_theme: 'dark',
    is_builtin: true,
  },
  {
    id: 'persona-swe',
    name: 'Software Engineer (General LeetCode)',
    avatar_emoji: '💻',
    role: 'Software Engineer / Interview Prep',
    experience_level: 'intermediate',
    coding_background:
      'Practicing Blind 75 / NeetCode 150 patterns for software engineering interviews in Python.',
    coaching_style:
      'Practical SWE interview coach. Focus on clean modular Python, boundary edge cases, optimal time/space trade-offs, and clear verbal problem breakdown.',
    preferred_mode: 'tutor',
    preferred_voice: 'Puck',
    preferred_track: 'all',
    preferred_difficulty: 'medium',
    preferred_theme: 'dark',
    is_builtin: true,
  },
  {
    id: 'persona-quant',
    name: 'Quant & ML Research Candidate',
    avatar_emoji: '⚡',
    role: 'Quant DS & LLM Post-Training',
    experience_level: 'advanced',
    coding_background:
      'Experienced in algorithms, NumPy vectorization, streaming statistics, numerical stability, and LLM post-training (DPO, GRPO, FlashAttention, KV cache).',
    coaching_style:
      'Rigorous Socratic technical interviewer. Probe algorithmic invariants, cache locality, streaming constraints, numerical stability, and mathematical derivations.',
    preferred_mode: 'interview',
    preferred_voice: 'Puck',
    preferred_track: 'ds',
    preferred_difficulty: 'all',
    preferred_theme: 'dark',
    is_builtin: true,
  },
];

function loadLocalNotes(): RevisionNoteItem[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalNotes(notes: RevisionNoteItem[]): void {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {}
}

function loadLocalPersonas(): UserPersonaItem[] {
  try {
    const raw = localStorage.getItem(PERSONAS_STORAGE_KEY);
    if (!raw) return DEFAULT_PERSONAS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PERSONAS;
  } catch {
    return DEFAULT_PERSONAS;
  }
}

function saveLocalPersonas(personas: UserPersonaItem[]): void {
  try {
    localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(personas));
  } catch {}
}

interface AppState {
  problems: ProblemListItem[];
  currentProblem: ProblemDetail | null;
  code: string;
  cursorLine: number;
  mode: CoachMode;
  coachEngine: CoachEngine;
  avatarName: string;
  leftPaneTab: LeftPaneTab;

  personas: UserPersonaItem[];
  activePersonaId: string;
  showPersonaModal: boolean;

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

  revisionNotes: RevisionNoteItem[];
  isSynthesizingNote: boolean;
  unreadNotesCount: number;

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
  theme: 'dark' | 'light';

  setProblems: (problems: ProblemListItem[]) => void;
  setCurrentProblem: (problem: ProblemDetail) => void;
  setCode: (code: string) => void;
  setCursorLine: (line: number) => void;
  setMode: (mode: CoachMode) => void;
  setCoachEngine: (engine: CoachEngine) => void;
  setAvatarName: (name: string) => void;
  setLeftPaneTab: (tab: LeftPaneTab) => void;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setPersonas: (personas: UserPersonaItem[]) => void;
  setActivePersonaId: (id: string) => void;
  setShowPersonaModal: (show: boolean) => void;
  upsertPersona: (persona: UserPersonaItem) => void;
  removePersona: (id: string) => void;
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
  setRevisionNotes: (notes: RevisionNoteItem[]) => void;
  addOrUpdateRevisionNote: (
    note: RevisionNoteItem,
    switchToTab?: boolean
  ) => void;
  removeRevisionNote: (noteId: string) => void;
  setIsSynthesizingNote: (val: boolean) => void;
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
  leftPaneTab: 'problem',

  personas: loadLocalPersonas(),
  activePersonaId:
    (typeof localStorage !== 'undefined' &&
      localStorage.getItem(ACTIVE_PERSONA_KEY)) ||
    'persona-student',
  showPersonaModal: false,

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

  revisionNotes: loadLocalNotes(),
  isSynthesizingNote: false,
  unreadNotesCount: 0,

  timerSecondsRemaining: null,
  timerRunning: false,

  scorecard: null,
  showScorecardModal: false,
  showProblemDrawer: false,

  solvedIds: [],
  patternStats: {},
  targetFirm: 'quants related',
  theme:
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('livecoach_theme') as 'dark' | 'light')) ||
    'dark',

  setProblems: (problems) => set({ problems }),

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('livecoach_theme', next);
      } catch {}
      return { theme: next };
    }),

  setTheme: (theme) => {
    try {
      localStorage.setItem('livecoach_theme', theme);
    } catch {}
    set({ theme });
  },

  setPersonas: (serverPersonas) =>
    set((state) => {
      const byId = new Map<string, UserPersonaItem>();
      for (const p of serverPersonas) {
        byId.set(p.id, p);
      }
      for (const p of state.personas) {
        if (!byId.has(p.id)) {
          byId.set(p.id, p);
        }
      }
      const merged = Array.from(byId.values());
      saveLocalPersonas(merged);
      return { personas: merged };
    }),

  setActivePersonaId: (activePersonaId) => {
    try {
      localStorage.setItem(ACTIVE_PERSONA_KEY, activePersonaId);
    } catch {}
    set({ activePersonaId });
  },

  setShowPersonaModal: (showPersonaModal) => set({ showPersonaModal }),

  upsertPersona: (persona) =>
    set((state) => {
      const idx = state.personas.findIndex((p) => p.id === persona.id);
      const next =
        idx >= 0
          ? state.personas.map((p, i) => (i === idx ? persona : p))
          : [...state.personas, persona];
      saveLocalPersonas(next);
      return { personas: next };
    }),

  removePersona: (id) =>
    set((state) => {
      const next = state.personas.filter((p) => p.id !== id);
      saveLocalPersonas(next);
      const nextActive =
        state.activePersonaId === id ? 'persona-student' : state.activePersonaId;
      try {
        localStorage.setItem(ACTIVE_PERSONA_KEY, nextActive);
      } catch {}
      return { personas: next, activePersonaId: nextActive };
    }),

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

  setLeftPaneTab: (leftPaneTab) =>
    set((state) => ({
      leftPaneTab,
      unreadNotesCount: leftPaneTab === 'notes' ? 0 : state.unreadNotesCount,
    })),

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

  setRevisionNotes: (serverNotes) =>
    set((state) => {
      const map = new Map<string, RevisionNoteItem>();
      for (const n of [...serverNotes, ...state.revisionNotes]) {
        if (n && n.id) map.set(n.id, n);
      }
      const merged = Array.from(map.values()).sort(
        (a, b) => (b.created_at || 0) - (a.created_at || 0)
      );
      saveLocalNotes(merged);
      return { revisionNotes: merged };
    }),

  addOrUpdateRevisionNote: (note, switchToTab = false) =>
    set((state) => {
      const idx = state.revisionNotes.findIndex((n) => n.id === note.id);
      let updated: RevisionNoteItem[];
      if (idx >= 0) {
        updated = [...state.revisionNotes];
        updated[idx] = note;
      } else {
        updated = [note, ...state.revisionNotes];
      }
      saveLocalNotes(updated);
      const nextTab = switchToTab ? 'notes' : state.leftPaneTab;
      const nextUnread =
        nextTab === 'notes' ? 0 : state.unreadNotesCount + (idx >= 0 ? 0 : 1);
      return {
        revisionNotes: updated,
        leftPaneTab: nextTab,
        unreadNotesCount: nextUnread,
      };
    }),

  removeRevisionNote: (noteId) =>
    set((state) => {
      const updated = state.revisionNotes.filter((n) => n.id !== noteId);
      saveLocalNotes(updated);
      return { revisionNotes: updated };
    }),

  setIsSynthesizingNote: (isSynthesizingNote) => set({ isSynthesizingNote }),

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
