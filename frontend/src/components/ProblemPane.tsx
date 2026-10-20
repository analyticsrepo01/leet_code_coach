import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Cpu,
  CheckCircle2,
  Sparkles,
  HelpCircle,
  Clock,
  Layers,
  FileText,
  Youtube,
  Play,
  ExternalLink,
  Eye,
  EyeOff,
  Code2,
  X,
} from 'lucide-react';
import { useAppStore } from '../store';

export const ProblemPane: React.FC = () => {
  const { currentProblem, mode, solvedIds, setCode } = useAppStore();
  const [showSolution, setShowSolution] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  useEffect(() => {
    setShowSolution(mode === 'review');
    setPlayingVideoId(null);
  }, [currentProblem?.id, mode]);

  if (!currentProblem) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
        Loading problem...
      </div>
    );
  }

  const isSolved = solvedIds.includes(currentProblem.id);
  const diffColor =
    currentProblem.difficulty === 'easy'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : currentProblem.difficulty === 'hard'
      ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
      : 'text-amber-400 bg-amber-500/10 border-amber-500/30';

  const resources = currentProblem.resources || [];
  const pdfResources = resources.filter(
    (r) => r.kind === 'pdf' || r.kind === 'docs' || r.url.endsWith('.pdf')
  );
  const videoResources = resources.filter(
    (r) => r.kind === 'youtube' || Boolean(r.video_id)
  );

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="space-y-2 border-b border-slate-800 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs font-bold">
              {currentProblem.id}
            </span>
            <span
              className={`px-2 py-0.5 rounded border text-xs font-medium capitalize ${diffColor}`}
            >
              {currentProblem.difficulty}
            </span>
            {currentProblem.leetcode && (
              <span className="text-xs text-slate-400 font-mono">
                LC #{currentProblem.leetcode}
              </span>
            )}
            <span className="text-xs text-slate-400">
              • Day {currentProblem.day}
            </span>
          </div>
          {isSolved && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" /> Solved
            </span>
          )}
        </div>

        <h1 className="text-lg font-bold text-white leading-snug">
          {currentProblem.title}
        </h1>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {currentProblem.pattern.map((pat) => (
            <span
              key={pat}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
            >
              <Layers className="w-3 h-3" />
              {pat.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Post-Training Relevance Callout */}
      {currentProblem.post_training_relevance && (
        <div className="rounded-lg bg-emerald-950/30 border border-emerald-500/25 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
            <Cpu className="w-3.5 h-3.5" />
            <span>Why This Matters for LLM Post-Training &amp; Quant</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {currentProblem.post_training_relevance}
          </p>
        </div>
      )}

      {/* Statement */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" /> Problem Statement
        </h2>
        <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900/50 rounded-lg p-3.5 border border-slate-800/80">
          {currentProblem.statement}
        </div>
      </div>

      {/* Examples */}
      {currentProblem.examples && currentProblem.examples.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Examples
          </h3>
          <div className="space-y-2.5">
            {currentProblem.examples.map((ex, i) => (
              <div
                key={i}
                className="rounded-lg bg-slate-900 border border-slate-800 p-3 font-mono text-xs space-y-1"
              >
                <div>
                  <span className="text-slate-400 select-none">Input: </span>
                  <span className="text-slate-100">{ex.input}</span>
                </div>
                <div>
                  <span className="text-slate-400 select-none">Output: </span>
                  <span className="text-emerald-300">{ex.output}</span>
                </div>
                {ex.explanation && (
                  <div className="text-slate-400 font-sans pt-1">
                    {ex.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Constraints */}
      {currentProblem.constraints && currentProblem.constraints.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Constraints
          </h3>
          <ul className="list-disc list-inside text-xs font-mono text-slate-300 space-y-1 bg-slate-900/40 rounded-lg p-3 border border-slate-800/60">
            {currentProblem.constraints.map((c, idx) => (
              <li key={idx}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Theory Rubric Points (for voice-only theory cards) */}
      {currentProblem.kind === 'theory' &&
        currentProblem.rubric_points &&
        currentProblem.rubric_points.length > 0 && (
          <div className="rounded-lg bg-indigo-950/30 border border-indigo-500/30 p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Voice Theory Card — Key Points to Cover Out Loud</span>
            </div>
            <ul className="list-disc list-inside text-xs text-slate-300 space-y-1.5">
              {currentProblem.rubric_points.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          </div>
        )}

      {/* Course Material PDFs & Curated YouTube Videos */}
      {resources.length > 0 && (
        <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <Youtube className="w-3.5 h-3.5 text-rose-400" />
              <span>Course PDFs &amp; YouTube Videos to Watch ({resources.length})</span>
            </span>
          </div>

          {playingVideoId && (
            <div className="rounded-lg overflow-hidden border border-slate-700 bg-black">
              <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900 text-[11px] text-slate-300">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Youtube className="w-3.5 h-3.5 text-rose-500" />
                  Course Video Player
                </span>
                <button
                  type="button"
                  onClick={() => setPlayingVideoId(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="aspect-video w-full">
                <iframe
                  src={`https://www.youtube.com/embed/${playingVideoId}?autoplay=1`}
                  title="YouTube video player"
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          {pdfResources.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                <span>Reference Course PDFs (Stanford SLP3 &amp; eCornell)</span>
              </div>
              {pdfResources.map((res, idx) => (
                <a
                  key={`pdf-${idx}`}
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-amber-950/20 hover:bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200 transition"
                >
                  <span className="truncate font-medium">{res.title}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 shrink-0">
                    <span>{res.duration || 'Open PDF'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </a>
              ))}
            </div>
          )}

          {videoResources.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1">
                <Youtube className="w-3 h-3" />
                <span>Curated YouTube Lectures &amp; Walkthroughs</span>
              </div>
              {videoResources.map((res, idx) => (
                <div
                  key={`vid-${idx}`}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-950/80 border border-slate-800 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate-200 hover:text-rose-300 flex items-center gap-1.5 truncate"
                    >
                      <Youtube className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span className="truncate">{res.title}</span>
                    </a>
                    <div className="text-[10px] text-slate-400 pl-5">
                      {res.channel || 'YouTube'}
                      {res.duration ? ` • ${res.duration}` : ''}
                    </div>
                  </div>
                  {res.video_id && (
                    <button
                      type="button"
                      onClick={() =>
                        setPlayingVideoId(
                          playingVideoId === res.video_id
                            ? null
                            : res.video_id || null
                        )
                      }
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 flex items-center gap-1 shrink-0"
                    >
                      <Play className="w-2.5 h-2.5" />
                      <span>{playingVideoId === res.video_id ? 'Hide' : 'Watch'}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Revealable Model Answer & Reference Solution */}
      {currentProblem.reference_solution && (
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5" />
              <span>Model Answer &amp; Reference Solution</span>
            </span>
            <div className="flex items-center gap-1.5">
              {showSolution && currentProblem.kind === 'coding' && (
                <button
                  type="button"
                  onClick={() => setCode(currentProblem.reference_solution || '')}
                  className="px-2 py-1 rounded text-[10px] font-semibold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 transition"
                >
                  Load into Editor
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSolution((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition"
              >
                {showSolution ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>Hide Answer</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Reveal Model Answer</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showSolution && (
            <pre className="text-xs font-mono text-emerald-300 bg-slate-950 rounded-lg p-3 border border-slate-800 whitespace-pre-wrap overflow-x-auto leading-relaxed">
              {currentProblem.reference_solution}
            </pre>
          )}
        </div>
      )}

      {/* Optimal Complexity & Follow-ups (Always shown in Review mode, or expandable) */}
      {(mode === 'review' || currentProblem.kind === 'theory' || showSolution) && (
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Target Optimal Complexity
            </span>
            <span className="font-mono text-slate-200">
              Time: {currentProblem.optimal.time} · Space:{' '}
              {currentProblem.optimal.space}
            </span>
          </div>
          {currentProblem.follow_ups.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" /> Interview Follow-Up
                Questions
              </div>
              <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                {currentProblem.follow_ups.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Phone-screen Habit Reminder */}
      <div className="rounded-lg bg-slate-900/40 border border-slate-800/80 p-3 text-xs text-slate-400 space-y-1">
        <div className="font-semibold text-slate-300">
          Phone-Screen Checklist:
        </div>
        <div>
          1. Restate &amp; clarify edge cases → 2. State brute force + Big-O →
          3. Optimize &amp; think aloud → 4. Trace edge cases (empty, negatives,
          ties, overflow).
        </div>
      </div>
    </div>
  );
};
