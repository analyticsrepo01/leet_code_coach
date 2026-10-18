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

export interface LearningResourceItem {
  title: string;
  url: string;
  video_id?: string;
  channel?: string;
  duration?: string;
  kind?: 'youtube' | 'docs' | 'article' | string;
}

export interface RevisionNoteItem {
  id: string;
  problem_id: string;
  problem_title: string;
  title: string;
  category: string;
  key_takeaways: string[];
  code_or_formula: string;
  content: string;
  resources?: LearningResourceItem[];
  source: 'live_coach' | 'ai_summary' | 'tutorial' | 'manual' | string;
  created_at: number;
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
  revision_notes?: RevisionNoteItem[];
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

export async function fetchRevisionNotes(): Promise<RevisionNoteItem[]> {
  const res = await fetch('/api/notes', { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch revision notes');
  return res.json();
}

export async function saveRevisionNoteApi(
  note: Partial<RevisionNoteItem> & { title: string }
): Promise<RevisionNoteItem> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(note),
  });
  if (!res.ok) throw new Error('Failed to save revision note');
  return res.json();
}

export async function deleteRevisionNoteApi(
  noteId: string
): Promise<{ deleted: boolean; id: string }> {
  const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete revision note');
  return res.json();
}

export async function synthesizeRevisionNoteApi(payload: {
  problem_id: string;
  transcript: Array<{ role: string; text: string }>;
  code: string;
  custom_topic?: string;
  custom_prompt?: string;
}): Promise<RevisionNoteItem> {
  const res = await fetch('/api/notes/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to synthesize revision note');
  return res.json();
}

export async function generateTutorialNoteApi(payload: {
  topic: string;
  problem_id?: string;
}): Promise<RevisionNoteItem> {
  const res = await fetch('/api/notes/tutorial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to generate 5-minute tutorial note');
  return res.json();
}

export async function searchLearningResourcesApi(
  query: string
): Promise<LearningResourceItem[]> {
  const res = await fetch(
    `/api/notes/resources/search?q=${encodeURIComponent(query)}`,
    { headers: getAuthHeaders() }
  );
  if (!res.ok) throw new Error('Failed to search learning resources');
  return res.json();
}

export async function sendArgonChatApi(payload: {
  problem_id: string;
  mode: string;
  message: string;
  code: string;
  cursor_line: number;
  test_results?: any[];
  transcript?: Array<{ role: string; text: string }>;
  session_id?: string;
}): Promise<{
  model: string;
  reply: string;
  voice_summary: string;
  highlight?: { line_start: number; line_end: number; note: string } | null;
  revealed_hint?: { level: number; total: number; text: string } | null;
  saved_note?: RevisionNoteItem | null;
}> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to query Gemini 4 Argon chat');
  return res.json();
}
