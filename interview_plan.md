# Interview Plan + "LiveCoach" Build Spec

Two artifacts in one file:

- **Part A:** a 2-day prep plan for a quants related post-training (ML research) first round.
- **Part B:** a build spec for **LiveCoach**, a personal LeetCode-style web app on Cloud Run. A Gemini Live API tutor watches my code, hears me talk through my reasoning, and coaches me by voice and chat.

> **For the building agent (agy):** Part B is the implementation brief. Build the **MVP (section B10)** first, deploy it, then add the extras. Where this doc names a Gemini model or SDK call, **check it against the current Gemini Live API docs** and keep model IDs in config, not hard-coded.

---

# PART A: 2-Day Prep Plan

**Profile:** ML data scientist, comfortable in Python and R. Interview code will be in **Python only**.
**Round 1 format (expected):** a 45–60 min technical phone screen with a research scientist. It includes live coding (LeetCode medium, or NumPy from scratch), ML/post-training theory, and maybe a probability question.

## Priorities

1. Four quant-heavy patterns: **hash maps, heaps, prefix sums, two pointers / sliding window**
2. **ML-flavored coding:** implementing post-training building blocks in NumPy (sampling, log-probs, DPO/GRPO losses)
3. Post-training theory: deriving DPO, PPO vs. DPO vs. GRPO, attention and the KV cache
4. Probability warm-ups

**Skip:** advanced DP, segment trees, graphs, linked-list gymnastics, C++, financial time-series topics.

## Day 1: data structures (about 7 h)

| Block | Problems (IDs refer to section B6) | Goal |
|---|---|---|
| 09:00–10:30 | P01 Two Sum, P02 Subarray Sum = K, P03 Group Anagrams | hash map and prefix-sum reflexes |
| 10:45–12:00 | P04 Max Drawdown, P05 Best Time to Buy/Sell, P06 Product Except Self | prefix and running-state patterns |
| 13:00–14:30 | P07 Two Sum II / 3Sum, P08 Longest Substring w/o Repeat, P09 Sliding Window Max | two pointers and windows |
| 14:45–16:30 | P10 Top-K Frequent, P11 Merge K Sorted Streams, **P12 Streaming Median** (x3) | heaps |
| 16:30–17:00 | Re-type P02 and P12 from memory | retention |

## Day 2: ML coding, theory, mock (about 6 h)

| Block | Content |
|---|---|
| 09:00–10:30 | ML coding: M01 stable softmax / log-softmax, M02 masked token log-probs, M03 top-k / top-p sampling |
| 10:45–12:00 | M04 DPO loss, M05 GRPO advantages, M06 PPO clipped loss, M07 causal attention |
| 12:00–13:00 | **Full mock interview in LiveCoach (interview mode)**: 1 DS problem + 1 ML problem + theory |
| 14:00–15:00 | Theory out loud: derive DPO on paper; PPO vs. DPO vs. GRPO (2 min each); KV cache / RoPE / FlashAttention |
| 15:00–16:00 | Probability: Bayes, Gambler's Ruin, E[max of n U(0,1)] = n/(n+1), coupon collector, dice EV |
| Evening | Light review; prepare a 2-min project deep dive; sleep |

## Phone-screen habits (the coach should reinforce these)

- Restate the problem and ask about edge cases before coding.
- Give the brute-force approach and its complexity, then the optimized one, then code.
- Think out loud the whole time; silence counts against you.
- Name edge cases: empty input, duplicates, negatives (they break sum-based windows), ties, float precision.
- Expect follow-ups like "What if it's a stream?" or "What if it doesn't fit in memory?" The answer is usually a heap, an O(1) running update, or reservoir sampling.

---

# PART B: LiveCoach Build Spec

## B1. Product summary

A single-user web app that feels like LeetCode:
- Left pane: problem statement, examples, and constraints.
- Center pane: a **Monaco** code editor (Python).
- Bottom pane: **Run / Submit** with test results and stdout.
- Right pane: **Coach**, with a chat transcript, a mic toggle, a speaking indicator, and a hint ladder.

The coach is a **Gemini Live API** session (bidirectional audio streaming). It:
- **hears** me think aloud (mic, streamed audio),
- **sees my code**: the app sends the editor contents and test results to the model directly as structured context. This is much more reliable than reading pixels from a screenshot,
- **optionally sees my screen** via `getDisplayMedia` frames (about 1 fps JPEG) for anything outside the editor,
- **speaks back** with streamed audio, and mirrors everything as text in the chat pane,
- **acts** through function calls: reading code, running tests, revealing the next hint, highlighting a line, scoring the session.

### Modes
| Mode | Coach behavior |
|---|---|
| **Tutor** (default) | Socratic. Asks guiding questions and uses the hint ladder. Never pastes a full solution unless I say "show solution". |
| **Interview** | Acts as a research-scientist interviewer. Timed (45 min). Gives minimal hints, asks about complexity, asks follow-ups ("now make it streaming"), and scores at the end. |
| **Review** | After solving: walks through an optimal solution, complexity, alternative approaches, and likely follow-ups. |

## B2. Architecture

```
Browser (React + Vite + TS)
 ├─ Monaco editor ──────────────┐
 ├─ Pyodide Web Worker (runs Python + numpy tests locally, sandboxed)
 ├─ AudioWorklet: mic → PCM16 16 kHz mono ─┐
 ├─ Audio player: PCM16 24 kHz ◄───────────┤
 ├─ Screen capture (optional) → JPEG 1fps ─┤
 └─ WebSocket  wss://<run-url>/ws/coach ◄──┘
                     │
Cloud Run service "livecoach" (Python 3.12, FastAPI, uvicorn)
 ├─ Serves built frontend (static)
 ├─ REST: /api/problems, /api/problems/{id}, /api/sessions, /healthz
 ├─ WS /ws/coach: proxy ⇄ Gemini Live API (google-genai SDK, async live.connect)
 │     - injects system prompt and problem context
 │     - declares tools; runs server-side tools; forwards client-side tool calls to the browser
 │     - handles session resumption and context-window compression
 └─ Firestore (optional): sessions, attempts, scores, weak-topic tracking
                     │
Vertex AI Gemini Live API (service-account auth, no API keys in browser)
```

### Key design decisions (with reasons)
1. **Server-side WebSocket proxy, not a direct browser connection.** The service account authenticates to Vertex AI, so no keys reach the browser. It also gives one place to inject context, run tools, and log. Cloud Run supports WebSockets (set request timeout to 3600s).
2. **Python runs in the browser via Pyodide in a Web Worker.** No untrusted code runs on the server. numpy is available. A hung loop is handled by terminating the worker.
3. **Code reaches the model as text, not pixels.** On every Run/Submit, and on a debounced editor change (about 8s idle, only if the code changed), the browser sends `{type:"code_snapshot"}` and the proxy forwards it to Live as context. Screen sharing is optional, for whiteboard-style work.
4. **Single Cloud Run service.** FastAPI serves both the API and the static frontend, so there's one deploy and no CORS.

## B3. Repository layout

```
leet_code_coach/
├── README.md
├── Dockerfile                      # multi-stage: node build → python runtime
├── .dockerignore
├── cloudbuild.yaml                 # optional CI
├── deploy.sh                       # gcloud run deploy wrapper
├── backend/
│   ├── pyproject.toml              # fastapi, uvicorn[standard], google-genai, pydantic, pyyaml, google-cloud-firestore (optional)
│   └── app/
│       ├── main.py                 # FastAPI app, static mount, routers
│       ├── config.py               # env-driven settings (pydantic-settings)
│       ├── problems.py             # load/validate problems/*.yaml at startup
│       ├── sessions.py             # session store (in-memory; Firestore if enabled)
│       ├── coach/
│       │   ├── live_proxy.py       # WS handler: browser ⇄ Gemini Live
│       │   ├── prompts.py          # system prompts per mode
│       │   ├── tools.py            # function declarations + server-side handlers
│       │   └── protocol.py         # pydantic models for WS messages
│       └── auth.py                 # optional shared-token check (if not using IAP)
├── frontend/
│   ├── package.json                # react, vite, typescript, @monaco-editor/react, zustand, tailwind
│   ├── index.html
│   ├── public/
│   │   └── audio-worklets/
│   │       ├── mic-processor.js    # Float32 → PCM16 16 kHz downsample, 20–40 ms chunks
│   │       └── player-processor.js # PCM16 24 kHz ring-buffer playback, flush on interrupt
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                 # 3-pane layout + top bar (mode, timer, problem picker)
│       ├── store.ts                # zustand: problem, code, results, transcript, mode, coach state
│       ├── api.ts                  # REST client
│       ├── coach/
│       │   ├── CoachSocket.ts      # WS client, message routing, reconnect
│       │   ├── audio.ts            # mic + player setup, VAD-independent (server VAD)
│       │   ├── screen.ts           # getDisplayMedia → canvas → JPEG base64 @1fps (toggle)
│       │   └── clientTools.ts      # handlers for client-side tool calls (highlight, run_tests…)
│       ├── runner/
│       │   ├── pyodide.worker.ts   # loads Pyodide + numpy, executes harness, returns results
│       │   └── runTests.ts         # spawn worker, timeout (default 5s/test), kill on hang
│       └── components/
│           ├── ProblemPane.tsx     # markdown render (react-markdown + KaTeX for math)
│           ├── EditorPane.tsx      # Monaco, line decorations for highlight_line
│           ├── ResultsPane.tsx     # per-test pass/fail, diff, stdout, runtime
│           ├── CoachPane.tsx       # transcript, mic button, speaking indicator, hint ladder UI
│           ├── ProblemList.tsx     # filter by pattern/day/status
│           └── Scorecard.tsx       # end-of-session rubric
└── problems/
    ├── P01_two_sum.yaml
    ├── ...
    └── M10_pass_at_k.yaml
```

## B4. Problem file schema (`problems/*.yaml`)

```yaml
id: P02
slug: subarray-sum-equals-k
title: Subarray Sum Equals K
leetcode: 560                 # null for custom ML problems
day: 1
pattern: [hash_map, prefix_sum]
difficulty: medium
post_training_relevance: >
  Prefix-sum + hashmap is the same trick used for counting token spans, packing
  boundaries, and cumulative-probability lookups (top-p, weighted sampling).
statement: |
  Given an integer array `nums` and an integer `k`, return the number of
  contiguous subarrays whose sum equals `k`.
examples:
  - input: "nums = [1,1,1], k = 2"
    output: "2"
constraints: ["1 <= len(nums) <= 2e4", "-1000 <= nums[i] <= 1000"]
function_name: subarray_sum
starter_code: |
  def subarray_sum(nums: list[int], k: int) -> int:
      pass
tests:                         # visible on Run
  - args: [[1,1,1], 2]
    expected: 2
  - args: [[1,2,3], 3]
    expected: 2
hidden_tests:                  # only on Submit
  - args: [[1,-1,0], 0]
    expected: 3
compare: exact                 # exact | float_tol(1e-6) | unordered | numpy_allclose
time_limit_ms: 2000
hints:                         # hint ladder, revealed one at a time
  - "What's the brute force and its complexity?"
  - "sum(nums[i:j]) can be written using two prefix sums."
  - "As you scan, how many earlier prefixes equal (current_prefix - k)?"
  - "Keep a Counter of prefix sums seen so far, starting with {0: 1}."
optimal: { time: "O(n)", space: "O(n)" }
follow_ups:
  - "Why does a sliding window fail here? (negatives)"
  - "Return the longest such subarray instead of the count."
reference_solution: |
  from collections import Counter
  def subarray_sum(nums, k):
      seen, cur, ans = Counter({0: 1}), 0, 0
      for x in nums:
          cur += x
          ans += seen[cur - k]
          seen[cur] += 1
      return ans
```

The backend **never sends `reference_solution` to the browser.** Only the coach's context gets it, and the coach is told not to reveal it in Tutor or Interview mode unless I explicitly ask.

### Test harness (runs inside Pyodide)
The harness `exec`s the user code in a fresh namespace and calls `function_name(*copy.deepcopy(args))`. It compares the result with the configured comparator, captures stdout, and records per-test runtime. It returns `[{idx, passed, got, expected, stdout, error, ms}]`. numpy outputs are converted with `.tolist()` before JSON serialization.

## B5. WebSocket protocol (`/ws/coach`)

**Browser → server**
| type | payload | notes |
|---|---|---|
| `start` | `{problem_id, mode}` | proxy opens the Live session with system prompt + problem context |
| `audio` | `{data: base64 PCM16 16k mono}` | or send as binary frames for efficiency |
| `text` | `{text}` | typed chat |
| `code_snapshot` | `{code, cursor_line, reason: "idle"\|"run"\|"submit"}` | debounced; skip if unchanged |
| `test_results` | `{results[], all_passed, kind: "run"\|"submit"}` | after every run |
| `screen_frame` | `{jpeg_b64}` | only when screen share is on, ≤1 fps |
| `tool_result` | `{call_id, result}` | reply to a client-side tool call |
| `control` | `{action: "switch_mode"\|"next_problem"\|"end"}` | |

**Server → browser**
| type | payload |
|---|---|
| `audio` | `{data: base64 PCM16 24k}` |
| `transcript` | `{role: "coach"\|"user", text, final}` (from input/output audio transcription) |
| `interrupted` | `{}`: flush the player buffer immediately (barge-in) |
| `tool_call` | `{call_id, name, args}`: client-side tools |
| `hint` | `{level, text}` |
| `score` | scorecard JSON |
| `status` | `{state: "connected"\|"reconnecting"\|"error", detail}` |

### Live API session config (verify field names against current docs)
- Model: from env `LIVE_MODEL`, set to the current Gemini Live native-audio model available on Vertex in the chosen region.
- `response_modalities: ["AUDIO"]`, with `output_audio_transcription` and `input_audio_transcription` enabled, so the chat pane shows both sides as text.
- `speech_config`: voice from env `LIVE_VOICE`.
- `realtime_input_config`: automatic voice-activity detection (server VAD) on, so barge-in works.
- `context_window_compression`: sliding window enabled. Without it, audio sessions hit a time limit, and sessions with video frames hit it much sooner.
- `session_resumption`: store the latest handle per app session. On a `go_away` message or a disconnect, reconnect transparently with the handle.
- `tools`: the function declarations in B7.
- Code snapshots and test results are sent as **text input marked as context**, e.g. `"[EDITOR SNAPSHOT reason=run]\n```python\n...\n```"`. The system prompt tells the coach these are silent context: don't react to every snapshot; speak only when useful or when asked.

## B6. Problem bank (post-training-focused)

Two tracks. Track 1 covers the quant data-structure patterns quant firms test. Track 2 uses the **same patterns applied to LLM post-training code**, which is likely interview material for a post-training role and shows domain fluency.

### Track 1: Core data-structure patterns (Day 1)
| ID | Problem | LC | Pattern | Why it matters for post-training / quant |
|---|---|---|---|---|
| P01 | Two Sum | 1 | hash map | baseline reflex; dedup / lookup in data pipelines |
| P02 | Subarray Sum Equals K | 560 | prefix sum + hash map | the key prefix-sum trick |
| P03 | Group Anagrams | 49 | hash map (canonical key) | canonicalizing for exact-dup detection in SFT data |
| P04 | Max Drawdown of P&L (custom) | — | running max | running-state; also "worst eval regression across checkpoints" |
| P05 | Best Time to Buy/Sell Stock I & II | 121/122 | one pass / greedy | guaranteed quants related favorite |
| P06 | Product of Array Except Self | 238 | prefix/suffix | prefix tricks without division |
| P07 | Two Sum II + 3Sum | 167/15 | two pointers | sorted-array reasoning |
| P08 | Longest Substring Without Repeating Chars | 3 | sliding window + hash map | variable-window template |
| P09 | Sliding Window Maximum | 239 | monotonic deque | rolling max of loss / reward |
| P10 | Top K Frequent Elements | 347 | Counter + heap | top-k tokens / n-grams |
| P11 | Merge K Sorted Lists (arrays) | 23 | heap | merging sorted shards / tick streams |
| P12 | Find Median from Data Stream | 295 | two heaps | **high probability**; streaming stats |
| P13 | Kth Largest in a Stream | 703 | min-heap size k | streaming top-k |
| P14 | LRU Cache | 146 | OrderedDict / dict + DLL | KV-cache / prefix-cache eviction analogy |
| P15 | Minimum Size Subarray Sum | 209 | sliding window | window shrink logic |
| P16 | Contiguous Array | 525 | prefix sum + first-index map | longest balanced span |
| P17 | Insert/Delete/GetRandom O(1) | 380 | hash map + array | replay buffers, uniform sampling |
| P18 | Random Pick with Weight | 528 | prefix sum + binary search | weighted data-mixture sampling |

### Track 2: Post-training coding (Day 2), all custom, NumPy allowed
| ID | Problem | Pattern | Spec (function signature) | Test notes |
|---|---|---|---|---|
| M01 | Stable softmax & log-softmax | numerics | `log_softmax(x: np.ndarray, axis=-1)` | huge logits (1e4) must not overflow; `allclose` vs reference |
| M02 | Masked per-token log-probs | indexing + masking | `token_logprobs(logits[B,T,V], labels[B,T], mask[B,T]) -> (per_token[B,T], seq_sum[B])` | prompt tokens masked; shift-by-one semantics stated in problem |
| M03 | Top-k and top-p (nucleus) filtering | heap / sort + prefix sum | `top_p_filter(probs[V], p) -> renormalized probs` | always keep ≥1 token; ties; p=1.0 identity |
| M04 | DPO loss | log-sigmoid, numerics | `dpo_loss(pi_c, pi_r, ref_c, ref_r, beta) -> (loss, chosen_reward, rejected_reward)` | inputs are sequence log-probs; check stable log-sigmoid |
| M05 | GRPO group advantages | hash map grouping | `grpo_advantages(rewards, group_ids, eps=1e-6)` | groups of different sizes; zero-variance group → 0 advantage |
| M06 | PPO clipped surrogate (token-level) | vectorized masking | `ppo_loss(logp_new, logp_old, adv, mask, clip=0.2)` | masked mean; clip both signs |
| M07 | Causal self-attention (single head) | matrix ops | `causal_attention(Q,K,V) -> out` | mask with -inf before softmax; T=1 edge case |
| M08 | GAE | reverse prefix scan | `gae(rewards, values, gamma, lam) -> (adv, returns)` | terminal value handling |
| M09 | Sequence packing | greedy bin packing + heap | `pack(lengths, max_len) -> list[list[int]]` | each bin ≤ max_len; minimize bins (first-fit-decreasing is fine); report padding efficiency |
| M10 | Unbiased pass@k | combinatorics | `pass_at_k(n, c, k)` | use product form `1 - prod(1 - k/arange(n-c+1, n+1))`; c=0, n-c<k cases |
| M11 | Near-duplicate detection (n-gram Jaccard) | hash map / set | `dedup(docs, n=5, threshold=0.8) -> kept_indices` | O(n²) acceptable; follow-up: MinHash/LSH |
| M12 | BPE merge step | Counter + heap | `bpe_train(words: dict[str,int], num_merges) -> merges` | tie-breaking rule stated; follow-up: incremental pair-count updates |
| M13 | Welford running mean/var | streaming | `class RunningStats: update(x); mean; var` | matches np.var(ddof=0/1); used for reward normalization |
| M14 | Reservoir sampling | streaming | `reservoir(stream, k, seed)` | uniformity check via chi-square over many seeds |
| M15 | Bradley-Terry reward-model loss + accuracy | numerics | `bt_loss(r_chosen, r_rejected) -> (loss, acc)` | stable log-sigmoid |
| M16 | KL estimators (k1, k2, k3) | numerics | `kl_estimators(logp, logq) -> dict` | k3 always ≥ 0; explain bias/variance |

### Theory cards (voice-only, no editor)
The coach asks, listens, and grades on the rubric. Each card includes a model answer, available only to the coach.
- T01 Derive DPO from the KL-regularized RL objective (closed-form optimal policy, then substitute into Bradley-Terry).
- T02 PPO vs. DPO vs. GRPO: what each needs (reward model / critic / reference), stability, and costs.
- T03 RLVR / GRPO failure modes: length bias, entropy collapse, reward hacking, zero-variance groups.
- T04 Forward vs. reverse KL; why RLHF's penalty is effectively reverse KL (mode-seeking).
- T05 Attention complexity, the KV cache memory formula, MQA/GQA, FlashAttention (tiling, IO-awareness).
- T06 RoPE as rotations; why it encodes relative position.
- T07 SFT details: loss masking, packing with attention masks, catastrophic forgetting, data mixing.
- T08 Eval pitfalls: contamination, LLM-judge bias, seed variance, pass@k vs. pass@1.
- T09 Adam vs. AdamW; why RL fine-tuning uses small learning rates.
- T10 Probability quickies: E[max of n U(0,1)], Gambler's Ruin, Bayes with a noisy test, coupon collector.

## B7. Coach tools (function calling)

| Tool | Side | Args | Behavior |
|---|---|---|---|
| `get_editor_state` | client | `{}` | returns `{code, cursor_line, last_results}` |
| `run_tests` | client | `{hidden: bool}` | triggers Pyodide run; result is also pushed as `test_results` |
| `highlight_line` | client | `{line_start, line_end, note}` | Monaco decoration + hover note ("off-by-one here?") |
| `reveal_hint` | server | `{level}` | returns the next hint from the YAML ladder; logs that the hint was used |
| `get_problem_details` | server | `{field}` | `follow_ups`, `optimal`, `reference_solution` (the latter only in Review mode or after "show solution") |
| `start_timer` / `stop_timer` | client | `{minutes}` | interview mode |
| `submit_scorecard` | server | rubric JSON (below) | persisted; rendered in the Scorecard component |
| `next_problem` | server | `{pattern?, difficulty?}` | picks the next unsolved problem, weighted toward weak patterns |

**Scorecard rubric (1–4 each):** problem understanding / clarifying questions, approach and complexity analysis, code correctness, code quality and Python idioms, communication (thinking aloud), edge cases and testing, hint dependence (number of hints used). Plus `strengths[]`, `improvements[]`, `recommended_next[]`.

## B8. System prompts (`coach/prompts.py`)

**Shared base (all modes):**
```
You are LiveCoach, a concise, warm, technically rigorous interview coach helping
a candidate prepare for a {TARGET_FIRM} LLM post-training research interview
(first-round phone screen). The candidate is an ML data scientist fluent in
Python and R; interview code is Python.

You receive silent context messages:
  [PROBLEM] the current problem (statement, tests, hints, optimal complexity)
  [EDITOR SNAPSHOT reason=...] the candidate's current code
  [TEST RESULTS] latest run output
  (optional) screen frames
Do NOT narrate or react to every snapshot. Speak when: the candidate asks,
they have been stuck/silent for a while, a run fails, or they are heading
into a clearly wrong approach for more than a minute.

Voice style: short turns (1–3 sentences), one question at a time, no
markdown in speech, say code identifiers plainly. Let the candidate talk;
stop immediately if interrupted.

Always push the phone-screen habits: restate the problem, clarify edge cases,
state brute force + complexity before optimizing, think aloud, test edge cases.
For ML problems, also probe numerical stability, shapes, and masking.
```

**Tutor addendum:** Socratic method. Use `reveal_hint` one level at a time, only after the candidate has tried. Never give the full solution unless the candidate says "show solution". When tests fail, ask them to trace a failing case before pointing anything out. Use `highlight_line` to point at a bug instead of rewriting it.

**Interview addendum:** You are a {TARGET_FIRM} research scientist conducting a 45-minute screen. Start with a 30-second intro, give the problem, and say little. Give hints only if the candidate is stuck for more than 3 minutes, and note it. After they solve it, ask about complexity and one follow-up from `follow_ups`. Finish with one theory card related to the problem. Then call `submit_scorecard` and give candid verbal feedback.

**Review addendum:** Walk through the optimal solution and its complexity, compare it with the candidate's code, show the idiomatic Python version, and name the pattern and where else it shows up (especially in post-training code).

## B9. Cloud Run deployment

### Dockerfile (multi-stage)
```dockerfile
# --- build frontend ---
FROM node:20-slim AS fe
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build            # outputs /fe/dist

# --- runtime ---
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir uv && uv pip install --system -r pyproject.toml
COPY backend/app ./app
COPY problems ./problems
COPY --from=fe /fe/dist ./static
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --ws-ping-interval 20 --ws-ping-timeout 20
```

### Environment / config (`config.py`)
| Var | Example | Notes |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | `<YOUR_PROJECT_ID>` | Vertex project |
| `GOOGLE_CLOUD_LOCATION` | `us-central1` | must be a region where the Live model is available |
| `GOOGLE_GENAI_USE_VERTEXAI` | `true` | google-genai SDK uses Vertex with ADC |
| `LIVE_MODEL` | *(current Live native-audio model ID)* | look up in docs; don't hard-code |
| `LIVE_VOICE` | e.g. `Puck` | |
| `USE_FIRESTORE` | `false` | MVP uses in-memory |
| `ACCESS_TOKEN` | random string | only if not using IAP; checked on `/ws` and `/api` |
| `TARGET_FIRM` | e.g. `quants related` | substituted into `{TARGET_FIRM}` in prompts; keep any firm name out of the repo |

### deploy.sh
```bash
#!/usr/bin/env bash
set -euo pipefail
PROJECT=${PROJECT:-<YOUR_PROJECT_ID>}
REGION=${REGION:-us-central1}
SA=leetcoach-sa@${PROJECT}.iam.gserviceaccount.com

gcloud services enable run.googleapis.com aiplatform.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT"

gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 || \
  gcloud iam service-accounts create leetcoach-sa --project "$PROJECT"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/aiplatform.user --condition=None >/dev/null

gcloud run deploy livecoach \
  --source . \
  --project "$PROJECT" --region "$REGION" \
  --service-account "$SA" \
  --timeout 3600 \
  --session-affinity \
  --min-instances 1 --max-instances 2 \
  --cpu 1 --memory 1Gi --concurrency 10 \
  --no-cpu-throttling \
  --set-env-vars GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$REGION,LIVE_MODEL=${LIVE_MODEL:?set LIVE_MODEL},LIVE_VOICE=${LIVE_VOICE:-Puck},TARGET_FIRM="${TARGET_FIRM:-quants related}" \
  --no-allow-unauthenticated
```
**Why these flags:**
- `--timeout 3600`: WebSocket sessions last up to 60 minutes.
- `--session-affinity`: reconnects land on the same instance, which holds the in-memory resumption handle.
- `--no-cpu-throttling`: background streaming keeps running between requests.
- `--min-instances 1`: no cold start right before a practice session.

**Access:** this is a personal app with a reference solution in context, so keep it private. Preferred: enable **IAP on the Cloud Run service** and allow only my Google account. Fallback: `--allow-unauthenticated` plus the `ACCESS_TOKEN` check, with the token entered once in the UI and stored in localStorage.

### Local dev
- `cd frontend && npm run dev` (Vite proxies `/api` and `/ws` to `localhost:8080`).
- `cd backend && uv run uvicorn app.main:app --reload --port 8080`, using `gcloud auth application-default login` for ADC.
- Mic and screen capture need HTTPS or localhost. Cloud Run's URL is HTTPS.

## B10. Build order

### MVP (build this first, about 2–3 h for agy)
1. Backend: FastAPI, problem loader, `/api/problems`, static serving, `/healthz`.
2. Problem YAMLs: **P01, P02, P04, P08, P10, P12, M01, M03, M04, M05**, with full tests and hints.
3. Frontend: 3-pane layout, Monaco, problem picker, Pyodide runner with timeout, results pane.
4. Live proxy: start session with Tutor prompt + problem context; mic in, audio out, transcripts, barge-in (`interrupted` → flush player); `code_snapshot` on Run and on idle; `test_results` forwarding.
5. Tools: `get_editor_state`, `reveal_hint`, `highlight_line`.
6. Deploy to Cloud Run with `deploy.sh` and verify the voice round trip on the deployed URL.

### v1 (after MVP works end to end)
7. Interview mode with timer + `submit_scorecard` + Scorecard view; Review mode.
8. Remaining problems (all of Track 1 and Track 2) + theory cards (voice-only view without the editor).
9. Session resumption + context-window compression hardening; reconnect UI.
10. Optional screen-share toggle (1 fps JPEG frames).
11. Firestore persistence; a progress dashboard by pattern; `next_problem` weighted toward weak patterns.

### Acceptance checks
- [ ] I can pick P02, talk through brute force out loud, and the coach responds by voice within about 1s and asks about complexity.
- [ ] Interrupting the coach mid-sentence stops its audio immediately.
- [ ] Pressing Run on a wrong solution: the coach knows which test failed without me reading it out.
- [ ] Asking "what's wrong with line 6?": the coach highlights the line in the editor.
- [ ] Hints come one level at a time; the solution never appears in Tutor mode unless I say "show solution".
- [ ] A `while True:` loop is killed by the runner timeout without freezing the UI.
- [ ] A 30+ minute session survives (compression and resumption work).
- [ ] Interview mode ends with a scorecard that has actionable improvements.
- [ ] `reference_solution` never appears in any browser network response.

## B11. Known pitfalls for the builder
- **Audio formats:** mic input must be **PCM16, 16 kHz, mono, little-endian**; model output is **PCM16 24 kHz**. Browsers capture at 44.1/48 kHz, so downsample in the AudioWorklet. Never use ScriptProcessorNode.
- **Barge-in:** when the server sends `interrupted`, clear the playback ring buffer immediately, or the coach talks over me.
- **Snapshot spam:** debounce snapshots and send only diffs or changed content. Otherwise the coach comments on every keystroke and the context fills up quickly.
- **Session limits:** without context-window compression, sessions get cut off, and sooner with video. Enable compression and handle `go_away` by reconnecting with the resumption handle.
- **Pyodide cold start** is a few seconds: preload the worker and numpy on page load, and show a "runner ready" indicator.
- **Cloud Run WebSockets:** keep pings flowing (uvicorn ws ping, set above) so idle connections aren't dropped. Each WS counts toward concurrency.
- **Secrets:** no API keys in the frontend. Vertex auth comes only from the service account.
