import { ProblemDetail, TestCaseResult, recordRunApi } from '../api';
import { useAppStore } from '../store';
import { coachSocket } from '../coach/CoachSocket';

let worker: Worker | null = null;
let currentRunResolver: ((results: TestCaseResult[]) => void) | null = null;
let currentTimeoutId: any = null;

function createWorker(): Worker {
  const w = new Worker(new URL('./pyodide.worker.ts', import.meta.url), {
    type: 'module',
  });

  w.onmessage = (event: MessageEvent) => {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'ready') {
      useAppStore.getState().setRunnerReady(true);
    } else if (msg.type === 'results') {
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
        currentTimeoutId = null;
      }
      if (currentRunResolver) {
        const resolve = currentRunResolver;
        currentRunResolver = null;
        resolve(msg.results || []);
      }
    }
  };

  w.postMessage({ type: 'preload' });
  return w;
}

export function preloadRunner(): void {
  if (!worker) {
    worker = createWorker();
  }
}

export async function executeProblemTests(
  problem: ProblemDetail,
  code: string,
  includeHidden: boolean
): Promise<{ results: TestCaseResult[]; allPassed: boolean }> {
  const store = useAppStore.getState();
  store.setIsRunningTests(true);

  const kind: 'run' | 'submit' = includeHidden ? 'submit' : 'run';
  // Send code snapshot with reason="run" or "submit"
  coachSocket.sendCodeSnapshot(code, store.cursorLine, kind);

  const combinedTests = [
    ...problem.tests.map((t) => ({ ...t, hidden: false })),
    ...(includeHidden
      ? problem.hidden_tests.map((t) => ({ ...t, hidden: true }))
      : []),
  ];

  if (!worker) {
    worker = createWorker();
  }

  const timeoutMs = Math.max(
    (problem.time_limit_ms || 2000) * Math.min(combinedTests.length, 4),
    5000
  );

  const results = await new Promise<TestCaseResult[]>((resolve) => {
    currentRunResolver = resolve;
    const runId = `${Date.now()}`;

    currentTimeoutId = setTimeout(() => {
      // Infinite loop / timeout — terminate worker immediately and respawn!
      if (worker) {
        worker.terminate();
        worker = null;
      }
      useAppStore.getState().setRunnerReady(false);
      worker = createWorker();
      currentRunResolver = null;
      resolve(
        combinedTests.map((tc, idx) => ({
          idx,
          passed: false,
          got: null,
          expected: tc.expected,
          stdout: '',
          error: `Time Limit Exceeded (${timeoutMs} ms). Worker terminated to stop infinite loop.`,
          ms: timeoutMs,
          hidden: tc.hidden,
        }))
      );
    }, timeoutMs);

    worker!.postMessage({
      type: 'run',
      runId,
      code,
      functionName: problem.function_name,
      tests: combinedTests,
      compare: problem.compare,
    });
  });

  const allPassed = results.length > 0 && results.every((r) => r.passed);
  store.setTestResults(results, allPassed, kind);
  store.setIsRunningTests(false);

  // Forward test results to Live Coach over WebSocket
  coachSocket.sendTestResults(results, allPassed, kind);

  // Also record on backend session store
  recordRunApi({
    session_id: store.sessionId,
    problem_id: problem.id,
    all_passed: allPassed,
    kind,
    results,
  }).catch(() => {});

  return { results, allPassed };
}
