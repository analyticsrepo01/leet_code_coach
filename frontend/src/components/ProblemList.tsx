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
} from 'lucide-react';
import { useAppStore } from '../store';
import { fetchNextRecommendedProblem, fetchProblem } from '../api';
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
  } = useAppStore();

  const [trackFilter, setTrackFilter] = useState<'all' | 'ds' | 'ml' | 'theory'>(
    'all'
  );
  const [patternFilter, setPatternFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  if (!showProblemDrawer) return null;

  const allPatterns = Array.from(
    new Set(problems.flatMap((p) => p.pattern))
  ).sort();

  const filtered = problems.filter((p) => {
    if (trackFilter !== 'all' && p.track !== trackFilter) return false;
    if (patternFilter !== 'all' && !p.pattern.includes(patternFilter))
      return false;
    if (
      search.trim() &&
      !`${p.id} ${p.title} ${p.pattern.join(' ')}`
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-start">
      <div className="w-full max-w-2xl bg-slate-900 border-r border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">
              2-Day Quant DS &amp; Post-Training ML Problem Bank
            </h2>
            <p className="text-xs text-slate-400">
              {solvedIds.length} of {problems.length} completed · Track 1 (DS),
              Track 2 (NumPy Post-Training), &amp; Voice Theory Cards
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePickWeakestNext}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Next Recommended (Weak Pattern)
            </button>
            <button
              onClick={() => setShowProblemDrawer(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-slate-800 space-y-2.5 bg-slate-950/50">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { id: 'all', label: `All (${problems.length})`, icon: Layers },
              {
                id: 'ds',
                label: 'Day 1: Quant Data Structures (P01–P18)',
                icon: Code2,
              },
              {
                id: 'ml',
                label: 'Day 2: Post-Training NumPy (M01–M16)',
                icon: Cpu,
              },
              {
                id: 'theory',
                label: 'Voice Theory Cards (T01–T10)',
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

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ID (P12, M04, T01), title, or pattern..."
                className="w-full bg-slate-900 border border-slate-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

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
                  isCurrent ? 'bg-slate-800/80 border-l-4 border-emerald-400' : ''
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300">
                      {p.id}
                    </span>
                    <span className="text-sm font-semibold text-slate-100">
                      {p.title}
                    </span>
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
