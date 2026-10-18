import React from 'react';
import { X, Award, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAppStore } from '../store';
import { fetchProblem } from '../api';
import { coachSocket } from '../coach/CoachSocket';

const RUBRIC_LABELS: Array<{ key: string; label: string }> = [
  {
    key: 'problem_understanding',
    label: 'Problem Understanding & Clarifying Questions',
  },
  {
    key: 'approach_and_complexity',
    label: 'Brute-Force → Optimal Approach & Big-O Analysis',
  },
  { key: 'code_correctness', label: 'Code Correctness & Test Pass Rate' },
  {
    key: 'code_quality_and_idioms',
    label: 'Code Quality & Python / NumPy Idioms',
  },
  { key: 'communication', label: 'Communication (Thinking Aloud Clearly)' },
  {
    key: 'edge_cases_and_testing',
    label: 'Edge Cases & Numerical Stability',
  },
  { key: 'hint_dependence', label: 'Independence (Minimal Hint Reliance)' },
];

export const ScorecardModal: React.FC = () => {
  const {
    scorecard,
    showScorecardModal,
    setShowScorecardModal,
    setCurrentProblem,
    mode,
  } = useAppStore();

  if (!showScorecardModal || !scorecard) return null;

  const scores = RUBRIC_LABELS.map(
    (r) => Number((scorecard as any)[r.key] || 3)
  );
  const avgScore = (
    scores.reduce((a, b) => a + b, 0) / scores.length
  ).toFixed(2);

  const handleNavigateToProblem = async (pid: string) => {
    try {
      const cleanId = pid.trim().split(/\s+/)[0];
      const detail = await fetchProblem(cleanId);
      setCurrentProblem(detail);
      setShowScorecardModal(false);
      if (coachSocket.isConnected) {
        coachSocket.switchContext(detail.id, mode);
      }
    } catch (e) {
      console.error('Could not load recommended problem:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Technical Phone-Screen Scorecard ({scorecard.problem_id})
              </h2>
              <p className="text-xs text-slate-400">
                Overall Average: <strong className="text-amber-300">{avgScore} / 4.00</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowScorecardModal(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {scorecard.summary && (
            <p className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg p-3 leading-relaxed">
              {scorecard.summary}
            </p>
          )}

          {/* Rubric Bars */}
          <div className="space-y-2.5">
            {RUBRIC_LABELS.map((item) => {
              const val = Number((scorecard as any)[item.key] || 3);
              const pct = (val / 4) * 100;
              const barColor =
                val >= 4
                  ? 'bg-emerald-500'
                  : val === 3
                  ? 'bg-sky-500'
                  : val === 2
                  ? 'bg-amber-500'
                  : 'bg-rose-500';
              return (
                <div key={item.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="font-mono font-bold text-slate-100">
                      {val} / 4
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full ${barColor} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Strengths & Improvements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="rounded-lg bg-emerald-950/25 border border-emerald-500/25 p-3 space-y-1.5">
              <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Strengths
              </div>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                {(scorecard.strengths || []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg bg-amber-950/25 border border-amber-500/25 p-3 space-y-1.5">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Actionable Improvements
              </div>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                {(scorecard.improvements || []).map((imp, i) => (
                  <li key={i}>{imp}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recommended Next */}
          {scorecard.recommended_next && scorecard.recommended_next.length > 0 && (
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                Recommended Next Problems
              </div>
              <div className="flex flex-wrap gap-2">
                {scorecard.recommended_next.map((pid, i) => (
                  <button
                    key={i}
                    onClick={() => handleNavigateToProblem(pid)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30"
                  >
                    <span>{pid}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
