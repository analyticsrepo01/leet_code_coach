import { useAppStore } from '../store';
import { executeProblemTests } from '../runner/runTests';

export async function handleClientToolCall(
  name: string,
  args: Record<string, any>
): Promise<Record<string, any>> {
  const store = useAppStore.getState();

  if (name === 'get_editor_state') {
    return {
      code: store.code,
      cursor_line: store.cursorLine,
      last_results: store.testResults,
      all_passed: store.allPassed,
    };
  }

  if (name === 'highlight_line') {
    const lineStart = Math.max(1, Number(args.line_start || 1));
    const lineEnd = Math.max(lineStart, Number(args.line_end || lineStart));
    const note = String(args.note || 'Check this line');
    store.setHighlight({
      line_start: lineStart,
      line_end: lineEnd,
      note,
    });
    return {
      status: 'highlighted',
      line_start: lineStart,
      line_end: lineEnd,
      note,
    };
  }

  if (name === 'run_tests') {
    const prob = store.currentProblem;
    if (!prob || prob.kind === 'theory') {
      return { error: 'No runnable coding problem active' };
    }
    const hidden = Boolean(args.hidden);
    const { results, allPassed } = await executeProblemTests(
      prob,
      store.code,
      hidden
    );
    return {
      all_passed: allPassed,
      results: results.slice(0, 8),
    };
  }

  if (name === 'start_timer') {
    const minutes = Number(args.minutes || 45);
    store.startTimer(minutes);
    return { status: 'timer_started', minutes };
  }

  if (name === 'stop_timer') {
    store.stopTimer();
    return { status: 'timer_stopped' };
  }

  return { error: `Unknown client tool: ${name}` };
}
