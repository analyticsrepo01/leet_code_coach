import React, { useState } from 'react';
import {
  Play,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Cpu,
} from 'lucide-react';
import { useAppStore } from '../store';
import { executeProblemTests } from '../runner/runTests';

export const ResultsPane: React.FC = () => {
  const {
    currentProblem,
    code,
    runnerReady,
    isRunningTests,
    testResults,
    lastRunKind,
    allPassed,
  } = useAppStore();

  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!currentProblem) return null;

  const isTheory = currentProblem.kind === 'theory';

  const handleRun = async (includeHidden: boolean) => {
    setSelectedIdx(0);
    await executeProblemTests(currentProblem, code, includeHidden);
  };

  const activeResult = testResults[selectedIdx] || testResults[0] || null;

  return (
    <div className="h-full flex flex-col bg-slate-950 border-t border-slate-800">
      {/* Action Bar */}
      <div className="h-10 px-3 border-b border-slate-800 bg-slate-900/70 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5" /> Test Runner
          </span>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
              runnerReady
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
            }`}
          >
            <Cpu className="w-3 h-3" />
            {runnerReady ? 'Pyodide + NumPy Ready' : 'Warming Pyodide...'}
          </span>

          {allPassed !== null && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                allPassed ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {allPassed ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> All{' '}
                  {testResults.length}{' '}
                  {lastRunKind === 'submit' ? 'Submit' : 'Sample'} Tests Passed
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />{' '}
                  {testResults.filter((r) => r.passed).length}/
                  {testResults.length} Passed
                </>
              )}
            </span>
          )}
        </div>

        {!isTheory && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRun(false)}
              disabled={isRunningTests}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 disabled:opacity-50 transition"
            >
              {isRunningTests ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 text-emerald-400" />
              )}
              Run ({currentProblem.tests.length})
            </button>

            <button
              onClick={() => handleRun(true)}
              disabled={isRunningTests}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition"
            >
              {isRunningTests ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Submit (All{' '}
              {currentProblem.tests.length + currentProblem.hidden_tests.length}
              )
            </button>
          </div>
        )}
      </div>

      {/* Results Body */}
      <div className="flex-1 overflow-y-auto p-3">
        {isTheory ? (
          <div className="text-xs text-slate-400 space-y-1">
            <p className="text-slate-300 font-medium">
              Voice-Only Theory Card Mode
            </p>
            <p>
              Connect the Voice Coach on the right and explain your derivation
              out loud. You can also write intermediate equations in the
              scratchpad above—the coach reads your scratchpad automatically!
            </p>
          </div>
        ) : testResults.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">
            Click <strong className="text-slate-300 mx-1">Run</strong> to execute
            visible tests or{' '}
            <strong className="text-emerald-400 mx-1">Submit</strong> to run
            visible + hidden edge-case tests in Pyodide.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Test Tabs */}
            <div className="flex flex-wrap gap-1.5">
              {testResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition ${
                    selectedIdx === i
                      ? 'bg-slate-800 border-slate-600 text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {r.passed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>
                    {r.hidden ? `Hidden #${i + 1}` : `Test #${i + 1}`}
                  </span>
                  <span className="text-[10px] text-slate-500">{r.ms}ms</span>
                </button>
              ))}
            </div>

            {/* Active Test Detail */}
            {activeResult && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs font-mono">
                <div className="rounded bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                  <div className="text-slate-400 font-sans font-semibold">
                    Expected Output
                  </div>
                  <div className="text-emerald-300 break-all">
                    {JSON.stringify(activeResult.expected)}
                  </div>
                </div>

                <div className="rounded bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                  <div className="text-slate-400 font-sans font-semibold">
                    Your Output
                  </div>
                  <div
                    className={
                      activeResult.passed
                        ? 'text-emerald-300 break-all'
                        : 'text-rose-400 break-all'
                    }
                  >
                    {activeResult.error
                      ? 'Error (see traceback below)'
                      : JSON.stringify(activeResult.got)}
                  </div>
                </div>

                {activeResult.stdout && (
                  <div className="md:col-span-2 rounded bg-slate-900 border border-slate-800 p-2.5 space-y-1">
                    <div className="text-slate-400 font-sans font-semibold">
                      stdout
                    </div>
                    <pre className="text-slate-200 whitespace-pre-wrap">
                      {activeResult.stdout}
                    </pre>
                  </div>
                )}

                {activeResult.error && (
                  <div className="md:col-span-2 rounded bg-rose-950/30 border border-rose-500/30 p-2.5 space-y-1">
                    <div className="text-rose-300 font-sans font-semibold">
                      Runtime / Timeout Error
                    </div>
                    <pre className="text-rose-200 whitespace-pre-wrap text-[11px]">
                      {activeResult.error}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
