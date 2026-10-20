import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  Sparkles,
  Search,
  Layers,
  Code2,
  Cpu,
  BookOpen,
  GraduationCap,
  Plus,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../store';
import {
  fetchNextRecommendedProblem,
  fetchProblem,
  fetchProblems,
  generateProblemApi,
} from '../api';
import { coachSocket } from '../coach/CoachSocket';

export const ProblemList: React.FC = () => {
  const {
    problems,
    currentProblem,
    solvedIds,
    patternStats,
    mode,
    showProblemDrawer,
    setShowProblemDrawer,
    setCurrentProblem,
    setProblems,
  } = useAppStore();

  const [trackFilter, setTrackFilter] = useState<
    'all' | 'slp3' | 'cs' | 'ds' | 'ml' | 'theory'
  >('all');
  const [difficultyFilter, setDifficultyFilter] = useState<
    'all' | 'easy' | 'medium' | 'hard'
  >('all');
  const [patternFilter, setPatternFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Custom LeetCode Problem Generator state
  const [showGenerator, setShowGenerator] = useState(false);
  const [genQuery, setGenQuery] = useState('');
  const [genDiff, setGenDiff] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [genTrack, setGenTrack] = useState<'cs' | 'ds' | 'ml'>('cs');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  if (!showProblemDrawer) return null;

  const isSlp3OrEcornell = (p: { id: string; pattern: string[]; title: string }) =>
    ['M17', 'M18', 'M19', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17'].includes(
      p.id
    ) ||
    p.pattern.some(
      (pat) =>
        pat.includes('stanford_slp3') ||
        pat.includes('ecornell') ||
        pat.includes('cme295')
    ) ||
    p.title.includes('Stanford SLP3') ||
    p.title.includes('Stanford CME 295') ||
    p.title.includes('eCornell');

  const allPatterns = Array.from(
    new Set(problems.flatMap((p) => p.pattern))
  ).sort();

  const filtered = problems.filter((p) => {
    if (trackFilter === 'slp3') {
      if (!isSlp3OrEcornell(p)) return false;
    } else if (trackFilter !== 'all' && p.track !== trackFilter) {
      return false;
    }
    if (
      difficultyFilter !== 'all' &&
      p.difficulty.toLowerCase() !== difficultyFilter
    )
      return false;
    if (patternFilter !== 'all' && !p.pattern.includes(patternFilter))
      return false;
    if (
      search.trim() &&
      !`${p.id} ${p.title} ${p.leetcode || ''} ${p.pattern.join(' ')}`
        .toLowerCase()
        .includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleSelectProblem = async (id: string) => {
    try {
      const detail = await fetchProblem(id);
      setCurrentProblem(detail);
      setShowProblemDrawer(false);
      if (coachSocket.isConnected) {
        coachSocket.switchContext(detail.id, mode);
      }
    } catch (e) {
      console.error('Failed to select problem:', e);
    }
  };

  const handlePickWeakestNext = async () => {
    try {
      const next = await fetchNextRecommendedProblem(currentProblem?.id);
      await handleSelectProblem(next.id);
    } catch (e) {
      console.error('Failed to pick next recommended problem:', e);
    }
  };

  const handleGenerateProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genQuery.trim() || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const created = await generateProblemApi({
        query: genQuery.trim(),
        difficulty: genDiff,
        track: genTrack,
      });
      const updatedList = await fetchProblems();
      setProblems(updatedList);
      setCurrentProblem(created);
      setGenQuery('');
      setShowGenerator(false);
      setShowProblemDrawer(false);
      if (coachSocket.isConnected) {
        coachSocket.switchContext(created.id, mode);
      }
    } catch (err: any) {
      setGenError(err?.message || 'Failed to generate problem');
    } finally {
      setGenerating(false);
    }
  };

  const slp3Count = problems.filter((p) => isSlp3OrEcornell(p)).length;
  const csCount = problems.filter((p) => p.track === 'cs').length;
  const dsCount = problems.filter((p) => p.track === 'ds').length;
  const mlCount = problems.filter((p) => p.track === 'ml').length;
  const theoryCount = problems.filter((p) => p.track === 'theory').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-start">
      <div className="w-full max-w-3xl bg-slate-900 border-r border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white">
              LeetCode, CS Classics, Quant DS &amp; Stanford SLP3 / eCornell Post-Training Bank
            </h2>
            <p className="text-xs text-slate-400">
              {solvedIds.length} of {problems.length} completed · CS Classics,
              Quant DS&amp;A, NumPy Post-Training, Stanford SLP3 &amp; eCornell Theory
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowGenerator((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add LeetCode Problem
            </button>
            <button
              type="button"
              onClick={handlePickWeakestNext}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Next Recommended
            </button>
            <button
              type="button"
              onClick={() => setShowProblemDrawer(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Custom LeetCode Problem Generator Panel */}
        {showGenerator && (
          <form
            onSubmit={handleGenerateProblem}
            className="p-3.5 bg-indigo-950/30 border-b border-indigo-500/30 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300">
                ✨ Generate &amp; Add Any LeetCode or CS Problem (via Gemini 4
                Argon)
              </span>
              <span className="text-[11px] text-slate-400">
                Auto-creates statement, starter code, hints &amp; verified tests
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                required
                value={genQuery}
                onChange={(e) => setGenQuery(e.target.value)}
                placeholder="e.g. LeetCode 42 Trapping Rain Water, Reverse Linked List, Spiral Matrix, FizzBuzz..."
                className="flex-1 min-w-[220px] bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400"
              />
              <select
                value={genDiff}
                onChange={(e) => setGenDiff(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="easy">Easy (Student / Intro)</option>
                <option value="medium">Medium (Standard)</option>
                <option value="hard">Hard (Advanced)</option>
              </select>
              <select
                value={genTrack}
                onChange={(e) => setGenTrack(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200"
              >
                <option value="cs">Track: CS Classics</option>
                <option value="ds">Track: Quant DS&amp;A</option>
                <option value="ml">Track: ML / NumPy</option>
              </select>
              <button
                type="submit"
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate &amp; Open
                  </>
                )}
              </button>
            </div>
            {genError && (
              <div className="text-xs text-rose-400">{genError}</div>
            )}
          </form>
        )}

        {/* Filters */}
        <div className="p-3 border-b border-slate-800 space-y-2.5 bg-slate-950/50">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'all', label: `All (${problems.length})`, icon: Layers },
              {
                id: 'slp3',
                label: `🧠 Stanford SLP3, CME 295 & eCornell (${slp3Count})`,
                icon: Sparkles,
              },
              {
                id: 'cs',
                label: `CS & LeetCode Classics (${csCount})`,
                icon: GraduationCap,
              },
              {
                id: 'ds',
                label: `Quant Data Structures (${dsCount})`,
                icon: Code2,
              },
              {
                id: 'ml',
                label: `Post-Training NumPy (${mlCount})`,
                icon: Cpu,
              },
              {
                id: 'theory',
                label: `Voice Theory Cards (${theoryCount})`,
                icon: BookOpen,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setTrackFilter(tab.id as any)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                    trackFilter === tab.id
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ID (C01, P12, M04), LeetCode #, title, or pattern..."
                className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <select
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-300"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy (Beginner / Student)</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            <select
              value={patternFilter}
              onChange={(e) => setPatternFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1 text-xs text-slate-300"
            >
              <option value="all">All Patterns</option>
              {allPatterns.map((pat) => (
                <option key={pat} value={pat}>
                  {pat.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Problem List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
          {filtered.map((p) => {
            const solved = solvedIds.includes(p.id);
            const isCurrent = currentProblem?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSelectProblem(p.id)}
                className={`w-full text-left p-3.5 hover:bg-slate-800/50 transition flex items-start justify-between gap-3 ${
                  isCurrent
                    ? 'bg-slate-800/80 border-l-4 border-emerald-400'
                    : ''
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300">
                      {p.id}
                    </span>
                    <span className="text-sm font-semibold text-slate-100">
                      {p.title}
                    </span>
                    {p.leetcode && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400">
                        LC #{p.leetcode}
                      </span>
                    )}
                    {solved && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-1">
                    {p.post_training_relevance}
                  </p>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {p.pattern.map((pat) => {
                      const st = patternStats[pat];
                      return (
                        <span
                          key={pat}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300"
                        >
                          {pat.replace(/_/g, ' ')}
                          {st && st.failed_runs > 0
                            ? ` (${st.failed_runs} err)`
                            : ''}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <span
                  className={`text-[11px] px-2 py-0.5 rounded capitalize shrink-0 ${
                    p.difficulty === 'easy'
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : p.difficulty === 'hard'
                      ? 'text-rose-400 bg-rose-500/10'
                      : 'text-amber-400 bg-amber-500/10'
                  }`}
                >
                  {p.difficulty}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
