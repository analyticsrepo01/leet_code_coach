export interface ProblemListItem {
  id: string;
  slug: string;
  title: string;
  kind: 'coding' | 'theory';
  track: 'ds' | 'ml' | 'theory';
  leetcode: number | null;
  day: number;
  pattern: string[];
  difficulty: string;
  post_training_relevance: string;
  optimal: { time: string; space: string };
}

export interface ProblemDetail extends ProblemListItem {
  statement: string;
  examples: Array<{ input: string; output: string; explanation?: string | null }>;
  constraints: string[];
  function_name: string;
  starter_code: string;
  tests: Array<{ args: any[]; expected: any }>;
  hidden_tests: Array<{ args: any[]; expected: any }>;
  compare: string;
  time_limit_ms: number;
  hints_total: number;
  follow_ups: string[];
  rubric_points: string[];
}

export interface TestCaseResult {
  idx: number;
  passed: boolean;
  got: any;
  expected: any;
  stdout: string;
  error: string | null;
  ms: number;
  hidden?: boolean;
}

export interface ScorecardData {
  problem_id: string;
  mode: string;
  problem_understanding: number;
  approach_and_complexity: number;
  code_correctness: number;
  code_quality_and_idioms: number;
  communication: number;
  edge_cases_and_testing: number;
  hint_dependence: number;
  strengths: string[];
  improvements: string[];
  recommended_next: string[];
  summary?: string;
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('livecoach_access_token') || '';
  return token ? { 'x-access-token': token } : {};
}

export async function fetchConfig(): Promise<any> {
  const res = await fetch('/api/config', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchProblems(): Promise<ProblemListItem[]> {
  const res = await fetch('/api/problems', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Problems fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchProblem(id: string): Promise<ProblemDetail> {
  const res = await fetch(`/api/problems/${encodeURIComponent(id)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Problem ${id} fetch failed: ${res.status}`);
  return res.json();
}

export async function requestHintApi(
  problemId: string,
  level: number,
  sessionId?: string
): Promise<{ level: number; total: number; text: string }> {
  const res = await fetch(`/api/problems/${encodeURIComponent(problemId)}/hint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ level, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`Hint request failed: ${res.status}`);
  return res.json();
}

export async function recordRunApi(payload: {
  session_id?: string;
  problem_id: string;
  all_passed: boolean;
  kind: 'run' | 'submit';
  results: TestCaseResult[];
}): Promise<any> {
  const res = await fetch('/api/sessions/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchDashboardStats(): Promise<{
  solved_ids: string[];
  pattern_stats: Record<
    string,
    { attempts: number; solved: number; hints: number; failed_runs: number }
  >;
  recent_scorecards: ScorecardData[];
}> {
  const res = await fetch('/api/sessions', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchNextRecommendedProblem(
  currentId?: string,
  pattern?: string
): Promise<ProblemListItem> {
  const params = new URLSearchParams();
  if (currentId) params.set('current_id', currentId);
  if (pattern) params.set('pattern', pattern);
  const res = await fetch(`/api/sessions/next?${params.toString()}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to pick next problem');
  return res.json();
}

export async function fetchVertexToken(
  problemId?: string,
  mode?: string
): Promise<{
  access_token: string;
  project_id: string;
  location: string;
  avatar_model: string;
  avatar_voice: string;
  system_instruction?: string;
}> {
  const params = new URLSearchParams();
  if (problemId) params.set('problem_id', problemId);
  if (mode) params.set('mode', mode);
  const res = await fetch(`/api/token?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch Vertex token');
  return res.json();
}
