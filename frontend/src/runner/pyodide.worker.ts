/// <reference lib="webworker" />

let pyodideInstance: any = null;
let initPromise: Promise<any> | null = null;

async function ensurePyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const pyodideModule: any = await import(
      /* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs'
    );
    const pyodide = await pyodideModule.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
    });
    await pyodide.loadPackage(['numpy']);
    pyodideInstance = pyodide;
    self.postMessage({ type: 'ready' });
    return pyodide;
  })();

  return initPromise;
}

const PYTHON_HARNESS = `
import copy
import io
import json
import sys
import time
import traceback
import numpy as np

def _to_serializable(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.floating, float)):
        return float(obj)
    if isinstance(obj, (np.integer, int)) and not isinstance(obj, bool):
        return int(obj)
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (list, tuple)):
        return [_to_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {str(k): _to_serializable(v) for k, v in obj.items()}
    return obj

def _deep_allclose(a, b, rtol=1e-5, atol=1e-5):
    a = _to_serializable(a)
    b = _to_serializable(b)
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return False
        return all(_deep_allclose(x, y, rtol, atol) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return bool(np.isclose(float(a), float(b), rtol=rtol, atol=atol))
    return a == b

def _compare(got, expected, mode):
    got_s = _to_serializable(got)
    exp_s = _to_serializable(expected)
    if mode in ("float_tol", "numpy_allclose") or mode.startswith("float_tol"):
        return _deep_allclose(got_s, exp_s, rtol=1e-5, atol=1e-5)
    if mode == "unordered":
        try:
            return sorted(got_s) == sorted(exp_s)
        except Exception:
            return got_s == exp_s
    return got_s == exp_s

def _run_suite(user_code, fn_name, tests_json, compare_mode):
    tests = json.loads(tests_json)
    ns = {}
    compile_stdout = io.StringIO()
    old_stdout = sys.stdout
    try:
        sys.stdout = compile_stdout
        exec(user_code, ns)
    except Exception:
        sys.stdout = old_stdout
        err = traceback.format_exc(limit=3)
        return json.dumps([
            {
                "idx": i,
                "passed": False,
                "got": None,
                "expected": tc["expected"],
                "stdout": compile_stdout.getvalue(),
                "error": err,
                "ms": 0.0,
                "hidden": bool(tc.get("hidden", False)),
            }
            for i, tc in enumerate(tests)
        ])
    finally:
        sys.stdout = old_stdout

    if fn_name not in ns or not callable(ns[fn_name]):
        msg = f"Function '{fn_name}' not found in your code."
        return json.dumps([
            {
                "idx": i,
                "passed": False,
                "got": None,
                "expected": tc["expected"],
                "stdout": "",
                "error": msg,
                "ms": 0.0,
                "hidden": bool(tc.get("hidden", False)),
            }
            for i, tc in enumerate(tests)
        ])

    fn = ns[fn_name]
    results = []
    for i, tc in enumerate(tests):
        buf = io.StringIO()
        t0 = time.perf_counter()
        try:
            sys.stdout = buf
            args_copy = copy.deepcopy(tc["args"])
            got = fn(*args_copy)
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            sys.stdout = old_stdout
            got_clean = _to_serializable(got)
            ok = _compare(got_clean, tc["expected"], compare_mode)
            results.append({
                "idx": i,
                "passed": bool(ok),
                "got": got_clean,
                "expected": tc["expected"],
                "stdout": buf.getvalue(),
                "error": None,
                "ms": elapsed_ms,
                "hidden": bool(tc.get("hidden", False)),
            })
        except Exception:
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            sys.stdout = old_stdout
            results.append({
                "idx": i,
                "passed": False,
                "got": None,
                "expected": tc["expected"],
                "stdout": buf.getvalue(),
                "error": traceback.format_exc(limit=4),
                "ms": elapsed_ms,
                "hidden": bool(tc.get("hidden", False)),
            })
    return json.dumps(results)
`;

self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if (!data) return;

  if (data.type === 'preload') {
    try {
      await ensurePyodide();
    } catch (err: any) {
      self.postMessage({
        type: 'error',
        error: err?.message || String(err),
      });
    }
    return;
  }

  if (data.type === 'run') {
    const { runId, code, functionName, tests, compare } = data;
    try {
      const pyodide = await ensurePyodide();
      pyodide.runPython(PYTHON_HARNESS);
      const runSuite = pyodide.globals.get('_run_suite');
      const rawJson = runSuite(
        code,
        functionName,
        JSON.stringify(tests),
        compare || 'exact'
      );
      const results = JSON.parse(rawJson);
      self.postMessage({
        type: 'results',
        runId,
        results,
      });
    } catch (err: any) {
      self.postMessage({
        type: 'results',
        runId,
        results: (tests || []).map((tc: any, idx: number) => ({
          idx,
          passed: false,
          got: null,
          expected: tc.expected,
          stdout: '',
          error: err?.message || String(err),
          ms: 0,
          hidden: Boolean(tc.hidden),
        })),
      });
    }
  }
};
