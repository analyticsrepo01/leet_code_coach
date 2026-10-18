# leet_code_coach

LiveCoach: a personal LeetCode-style practice app with a Gemini Live API voice tutor.
It watches your code and test runs, listens while you think aloud, and coaches you
by voice and chat. Problems focus on quant-interview data structures and LLM
post-training coding (log-probs, sampling, DPO/GRPO/PPO losses).

See [interview_plan.md](interview_plan.md) for the 2-day prep plan and the full build spec (Cloud Run + Vertex AI).

> Configure the project ID, region, model, and target firm through environment variables. Never commit secrets.
