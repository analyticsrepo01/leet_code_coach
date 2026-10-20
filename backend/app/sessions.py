import time
import uuid
from typing import Any, Optional
from pydantic import BaseModel, Field

from .config import settings
from .problems import problem_bank


class Scorecard(BaseModel):
    problem_id: str = ""
    mode: str = "interview"
    problem_understanding: int = Field(default=3, ge=1, le=4)
    approach_and_complexity: int = Field(default=3, ge=1, le=4)
    code_correctness: int = Field(default=3, ge=1, le=4)
    code_quality_and_idioms: int = Field(default=3, ge=1, le=4)
    communication: int = Field(default=3, ge=1, le=4)
    edge_cases_and_testing: int = Field(default=3, ge=1, le=4)
    hint_dependence: int = Field(default=4, ge=1, le=4)
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    recommended_next: list[str] = Field(default_factory=list)
    summary: str = ""
    created_at: float = Field(default_factory=time.time)


class RevisionNote(BaseModel):
    id: str = Field(default_factory=lambda: f"note-{uuid.uuid4().hex[:8]}")
    problem_id: str = ""
    problem_title: str = ""
    title: str
    category: str = "General"
    key_takeaways: list[str] = Field(default_factory=list)
    code_or_formula: str = ""
    content: str = ""
    resources: list[dict[str, Any]] = Field(default_factory=list)
    source: str = "live_coach"  # "live_coach" | "ai_summary" | "tutorial" | "manual"
    created_at: float = Field(default_factory=time.time)


import json
from pathlib import Path


class UserPersona(BaseModel):
    id: str = Field(default_factory=lambda: f"persona-{uuid.uuid4().hex[:8]}")
    name: str
    avatar_emoji: str = "🎓"
    role: str = "CS Student / Programmer"
    experience_level: str = "intermediate"  # "beginner" | "intermediate" | "advanced"
    coding_background: str = ""
    coaching_style: str = ""
    preferred_mode: str = "tutor"  # "tutor" | "interview" | "review"
    preferred_voice: str = "Puck"
    preferred_track: str = "all"   # "all" | "cs" | "ds" | "ml" | "theory"
    preferred_difficulty: str = "all"  # "all" | "easy" | "medium" | "hard"
    preferred_theme: str = "dark"  # "dark" | "light"
    is_builtin: bool = False
    created_at: float = Field(default_factory=time.time)


BUILTIN_PERSONAS: list[UserPersona] = [
    UserPersona(
        id="persona-student",
        name="CS Student (Grade 14 / College)",
        avatar_emoji="🎓",
        role="Grade 14 / Undergrad CS Student",
        experience_level="intermediate",
        coding_background=(
            "Studying Computer Science fundamentals in Python: arrays, strings, hash maps, "
            "two pointers, binary search, recursion, BFS/DFS graphs, and dynamic programming."
        ),
        coaching_style=(
            "Patient, encouraging mentor. Walk through small dry-run examples step-by-step, "
            "build visual intuition before writing code, explain Big-O clearly, and ask friendly Socratic questions."
        ),
        preferred_mode="tutor",
        preferred_voice="Puck",
        preferred_track="cs",
        preferred_difficulty="all",
        preferred_theme="dark",
        is_builtin=True,
    ),
    UserPersona(
        id="persona-beginner",
        name="Beginner / First-Time Coder",
        avatar_emoji="🌱",
        role="New to Python & Algorithms",
        experience_level="beginner",
        coding_background=(
            "Learning Python syntax (loops, lists, dictionaries, sets, functions) and basic algorithmic thinking from scratch."
        ),
        coaching_style=(
            "Super supportive, zero-jargon teacher. Explain Python syntax and built-in methods clearly with tiny 3-line examples, "
            "celebrate small wins, and guide one small step at a time."
        ),
        preferred_mode="tutor",
        preferred_voice="Puck",
        preferred_track="cs",
        preferred_difficulty="easy",
        preferred_theme="dark",
        is_builtin=True,
    ),
    UserPersona(
        id="persona-swe",
        name="Software Engineer (General LeetCode)",
        avatar_emoji="💻",
        role="Software Engineer / Interview Prep",
        experience_level="intermediate",
        coding_background=(
            "Practicing Blind 75 / NeetCode 150 patterns for software engineering interviews in Python."
        ),
        coaching_style=(
            "Practical SWE interview coach. Focus on clean modular Python, boundary edge cases, "
            "optimal time/space trade-offs, and clear verbal problem breakdown."
        ),
        preferred_mode="tutor",
        preferred_voice="Puck",
        preferred_track="all",
        preferred_difficulty="medium",
        preferred_theme="dark",
        is_builtin=True,
    ),
    UserPersona(
        id="persona-quant",
        name="Quant & ML Research Candidate",
        avatar_emoji="⚡",
        role="Quant DS & LLM Post-Training",
        experience_level="advanced",
        coding_background=(
            "Experienced in algorithms, NumPy vectorization, streaming statistics, numerical stability, "
            "and LLM post-training (DPO, GRPO, FlashAttention, KV cache)."
        ),
        coaching_style=(
            "Rigorous Socratic technical interviewer. Probe algorithmic invariants, cache locality, "
            "streaming constraints, numerical stability, and mathematical derivations."
        ),
        preferred_mode="interview",
        preferred_voice="Puck",
        preferred_track="ds",
        preferred_difficulty="all",
        preferred_theme="dark",
        is_builtin=True,
    ),
    UserPersona(
        id="persona-llm-ml",
        name="LLM & ML Learning (Stanford SLP3, CME 295 & eCornell Post-Training)",
        avatar_emoji="🧠",
        role="LLM Post-Training & NLP Engineer (Stanford SLP3 + CME 295 + eCornell)",
        experience_level="advanced",
        coding_background=(
            "Studying Stanford Speech & Language Processing (SLP3) Chapter 8 (Post-Training: Instruction Tuning / SFT, "
            "LoRA, Bradley-Terry Reward Models, RLHF/PPO, Direct Preference Optimization / DPO), "
            "Stanford SLP3 Transformer & Self-Attention Lecture Slides (transformer_aug26.pdf), "
            "Stanford SLP3 Chapter 9 (Masked Language Models / BERT 80-10-10 rule, [CLS] & BIO fine-tuning), "
            "Stanford CME 295 Transformers & Large Language Models VIP Cheatsheet (MoE, RoPE, Context Rot, Train/Test-Time Scaling, "
            "On-Policy Distillation OPD, GRPO/Dr.GRPO/DAPO, FlashAttention, PagedAttention, 4D Parallelism, Speculative Decoding, "
            "ReAct Agents, RAG, LLM-as-a-Judge biases, Diffusion LLMs), and the eCornell LLM Post-Training certification."
        ),
        coaching_style=(
            "Professor & Post-Training Architect grounded in Stanford SLP3 (Jurafsky & Martin), Stanford CME 295 (Amidi & Amidi), "
            "and eCornell Post-Training. Walk through exact mathematical equations (LoRA h = xW_0 + (alpha/r)xAB, Bradley-Terry, "
            "PPO 4-model setup, DPO implicit reward r_hat = beta log(pi/pi_ref), GRPO group advantages, MoE gating, "
            "Scaled Dot-Product Attention 1/sqrt(d_k), BERT 80/10/10 masking), connect every concept to clean NumPy/PyTorch code, "
            "cite the Stanford SLP3 & CME 295 PDFs, and recommend YouTube lectures."
        ),
        preferred_mode="tutor",
        preferred_voice="Aoede",
        preferred_track="ml",
        preferred_difficulty="all",
        preferred_theme="dark",
        is_builtin=True,
    ),
    UserPersona(
        id="persona-ml-interviewer",
        name="ML Mock Interviewer & Answer Coach",
        avatar_emoji="🎯",
        role="ML / LLM Interview Q&A Practice & Feedback",
        experience_level="advanced",
        coding_background=(
            "Practicing Machine Learning, Deep Learning, Transformers, and LLM Post-Training interview questions "
            "(Supervised Fine-Tuning / SFT, LoRA, Bradley-Terry Reward Modeling, RLHF / PPO, DPO, GRPO / Dr.GRPO / DAPO, "
            "Multi-Head Self-Attention, KV Cache, RoPE, MoE, FlashAttention, PagedAttention, Speculative Decoding, "
            "BERT Masked LM, Classical ML, Overfitting/Regularization, Precision/Recall/ROC-AUC, Optimization & Loss Functions)."
        ),
        coaching_style=(
            "Act as an interactive ML & LLM Technical Interviewer and Answer Coach: "
            "(1) Ask ONE realistic, high-signal ML or LLM interview question at a time and wait for the candidate's response. "
            "(2) When the candidate answers, grade their answer (e.g. X/10), clearly note What You Got Right, What Was Missing or Imprecise, "
            "and give 3-4 concrete, actionable Suggestions to Improve Their Answer, followed by a crisp Model Senior-Level Answer. "
            "(3) Automatically save a structured Q&A Feedback Note into Reference Notes (using save_revision_note / save_note) capturing the Question, "
            "Candidate's Answer Summary, Suggestions to Improve, and Model Answer. "
            "(4) End by asking the next follow-up or a new ML interview question."
        ),
        preferred_mode="interview",
        preferred_voice="Kore",
        preferred_track="ml",
        preferred_difficulty="all",
        preferred_theme="dark",
        is_builtin=True,
    ),
]


BUILTIN_NOTES: list[RevisionNote] = [
    RevisionNote(
        id="note-slp3-ch8",
        problem_id="T11",
        problem_title="Stanford SLP3 Ch. 8: Instruction Tuning (SFT), Loss Masking & LoRA Rank Scaling",
        title="📘 Stanford SLP3 Ch. 8 — Post-Training: SFT, LoRA, Bradley-Terry, RLHF (PPO) & DPO",
        category="Stanford SLP3 & Post-Training",
        key_takeaways=[
            "Supervised Fine-Tuning (SFT) shifts a base web-continuation LM to P(response y | instruction x) by masking prompt tokens with labels = -100 (ignore_index).",
            "LoRA freezes W_0 in R^(d x k) and learns h = x W_0 + (alpha / r) x A B with A ~ N(0, sigma^2) and B = 0 so Delta W = 0 at step 0; merges into W_0 for zero inference latency.",
            "Bradley-Terry pairwise reward model: P(y_w > y_l | x) = sigma(r_phi(x, y_w) - r_phi(x, y_l)).",
            "Online RLHF (PPO) holds 4 models in VRAM (Actor pi_theta, Critic V_psi, frozen Reference pi_ref, frozen Reward r_phi) with KL penalty -beta D_KL(pi_theta || pi_ref).",
            "DPO solves the KL-regularized RL objective in closed form: r(x,y) = beta log(pi(y|x)/pi_ref(y|x)) + beta log Z(x), where Z(x) cancels in Bradley-Terry!",
        ],
        code_or_formula=(
            "# 1. LoRA Forward Pass (SLP3 Ch. 8):\n"
            "# h = x @ W0 + (alpha / r) * ((x @ A) @ B)\n\n"
            "# 2. Bradley-Terry Reward Loss:\n"
            "# L_RM = -mean(log_sigmoid(r_chosen - r_rejected))\n\n"
            "# 3. DPO Loss (Numerically Stable):\n"
            "chosen_r = beta * (pi_chosen_logp - ref_chosen_logp)\n"
            "rejected_r = beta * (pi_rejected_logp - ref_rejected_logp)\n"
            "loss = np.mean(np.logaddexp(0.0, -(chosen_r - rejected_r)))"
        ),
        content=(
            "Complete study guide for Stanford SLP3 Chapter 8 (Post-Training). Covers Instruction Tuning (SFT), "
            "Parameter-Efficient Fine-Tuning with Low-Rank Adaptation (LoRA & QLoRA), Human Preference Alignment, "
            "Bradley-Terry Reward Modeling, PPO with 4 models, and Direct Preference Optimization (DPO)."
        ),
        resources=[
            {
                "title": "Stanford SLP3 Ch. 8 PDF — Post-Training: SFT, LoRA, RLHF & DPO (Local PDF)",
                "url": "/materials/slp3_ch8_post_training.pdf",
                "video_id": "",
                "channel": "Jurafsky & Martin (Stanford SLP3)",
                "duration": "PDF Ch. 8",
                "kind": "pdf",
            },
            {
                "title": "Stanford SLP3 Ch. 8 Official URL (web.stanford.edu/~jurafsky/slp3/8.pdf)",
                "url": "https://web.stanford.edu/~jurafsky/slp3/8.pdf",
                "video_id": "",
                "channel": "Stanford University",
                "duration": "Official PDF",
                "kind": "pdf",
            },
            {
                "title": "Direct Preference Optimization (DPO): Complete Mathematical Derivation",
                "url": "https://www.youtube.com/watch?v=hvGa5Mba4c8",
                "video_id": "hvGa5Mba4c8",
                "channel": "Umar Jamil",
                "duration": "46m",
                "kind": "youtube",
            },
            {
                "title": "LoRA: Low-Rank Adaptation of Large Language Models Explained",
                "url": "https://www.youtube.com/watch?v=DhRoTONcyZE",
                "video_id": "DhRoTONcyZE",
                "channel": "Umar Jamil",
                "duration": "28m",
                "kind": "youtube",
            },
            {
                "title": "Stanford CS224N — RLHF, Reward Modeling, PPO & DPO Lecture",
                "url": "https://www.youtube.com/watch?v=D8GOeCFFby4",
                "video_id": "D8GOeCFFby4",
                "channel": "Stanford Online",
                "duration": "1h 18m",
                "kind": "youtube",
            },
        ],
        source="tutorial",
    ),
    RevisionNote(
        id="note-slp3-transformers",
        problem_id="T13",
        problem_title="Stanford SLP3 Transformer Slides: Scaled Dot-Product Attention, Pre-LN Residual Stream & KV Cache",
        title="📊 Stanford SLP3 Slides — Transformers, Scaled Dot-Product Attention, Pre-LN & KV Cache",
        category="Stanford SLP3 & Post-Training",
        key_takeaways=[
            "Scaled Dot-Product Attention: softmax(Q K^T / sqrt(d_k) + M) V. Dividing by sqrt(d_k) keeps Var(q·k) = 1 so softmax does not saturate to one-hot vectors with vanishing gradients.",
            "Multi-Head Attention runs h parallel projections (d_k = d_model / h) so different heads attend to syntactic, coreference, and positional patterns simultaneously.",
            "Pre-LN Residual Stream: x' = x + MHA(LN(x)); y = x' + MLP(LN(x')) creates an unobstructed identity gradient highway d x_L / d x_0 = I + ...",
            "KV Cache stores past K, V tensors of shape 2 * B * L * g * N * d_k * bytes so decoding a new token is O(N * d) instead of O(N^2 * d).",
        ],
        code_or_formula=(
            "# Causal Scaled Dot-Product Self-Attention (NumPy):\n"
            "scores = (Q @ K.T) / np.sqrt(d_k)\n"
            "mask = np.triu(np.ones((N, N), dtype=bool), k=1)\n"
            "scores = np.where(mask, -np.inf, scores)\n"
            "weights = np.exp(scores - np.max(scores, axis=-1, keepdims=True))\n"
            "weights /= np.sum(weights, axis=-1, keepdims=True)\n"
            "out = weights @ V"
        ),
        content=(
            "Complete study guide for Stanford SLP3 Transformer & Self-Attention Lecture Slides (transformer_aug26.pdf). "
            "Covers Query/Key/Value projections, 1/sqrt(d_k) variance proof, causal masking, Multi-Head Attention tensor shapes, "
            "Pre-LN residual stream vs Post-LN, RoPE positional embeddings, and KV cache scaling."
        ),
        resources=[
            {
                "title": "Stanford SLP3 Transformer & Self-Attention Slides PDF (Local PDF)",
                "url": "/materials/slp3_transformer_slides_aug26.pdf",
                "video_id": "",
                "channel": "Jurafsky & Martin (Stanford SLP3 Slides)",
                "duration": "Slides PDF",
                "kind": "pdf",
            },
            {
                "title": "Stanford SLP3 Transformer Slides Official URL (transformer_aug26.pdf)",
                "url": "https://web.stanford.edu/~jurafsky/slp3/slides/transformer_aug26.pdf",
                "video_id": "",
                "channel": "Stanford University",
                "duration": "Official PDF",
                "kind": "pdf",
            },
            {
                "title": "3Blue1Brown — Attention in Transformers, Visually Explained",
                "url": "https://www.youtube.com/watch?v=eMlx5fFNoYc",
                "video_id": "eMlx5fFNoYc",
                "channel": "3Blue1Brown",
                "duration": "26m",
                "kind": "youtube",
            },
            {
                "title": "Andrej Karpathy — Let's Build GPT: from Scratch, in Code, Spelled Out",
                "url": "https://www.youtube.com/watch?v=kCc8FmEb1nY",
                "video_id": "kCc8FmEb1nY",
                "channel": "Andrej Karpathy",
                "duration": "1h 56m",
                "kind": "youtube",
            },
        ],
        source="tutorial",
    ),
    RevisionNote(
        id="note-slp3-ch9",
        problem_id="T14",
        problem_title="Stanford SLP3 Ch. 9: Bidirectional Encoder (BERT), 80/10/10 Masking, [CLS] & BIO Span Tagging",
        title="📗 Stanford SLP3 Ch. 9 — Masked Language Models (BERT), 80/10/10 Rule & Fine-Tuning",
        category="Stanford SLP3 & Post-Training",
        key_takeaways=[
            "Bidirectional encoders attend to both left and right context at every layer; standard causal LM loss would leak target tokens across layers.",
            "BERT selects 15% of input tokens for MLM loss and applies 80% [MASK], 10% random token, and 10% unchanged to eliminate pretrain-finetune mismatch.",
            "Sequence & pair classification uses the final [CLS] vector: softmax(h_[CLS] W_c) on '[CLS] Sent A [SEP] Sent B [SEP]'.",
            "Token-level NER / span tagging passes each token representation h_i to softmax(h_i W_tag) over BIO tags {B-PER, I-PER, O}, masking WordPiece '##' continuation subwords with -100.",
        ],
        code_or_formula=(
            "# BERT 80/10/10 Masked LM Corruption (SLP3 Ch. 9):\n"
            "labels = np.where(selected_mask, token_ids, -100)  # ignore_index = -100\n"
            "corrupted = token_ids.copy()\n"
            "corrupted[selected_mask & (u < 0.8)] = mask_token_id\n"
            "corrupted[selected_mask & (u >= 0.8) & (u < 0.9)] = random_token_ids[selected_mask & (u >= 0.8) & (u < 0.9)]"
        ),
        content=(
            "Complete study guide for Stanford SLP3 Chapter 9 (Masked Language Models). "
            "Covers bidirectional Transformer encoders, the Cloze task, BERT's 15% masking budget and 80/10/10 corruption rule, "
            "Next Sentence Prediction (NSP) vs RoBERTa dynamic masking, [CLS] classification, BIO Named Entity Recognition, and Cross-Encoder reranking."
        ),
        resources=[
            {
                "title": "Stanford SLP3 Ch. 9 PDF — Masked Language Models (BERT) (Local PDF)",
                "url": "/materials/slp3_ch9_masked_lm.pdf",
                "video_id": "",
                "channel": "Jurafsky & Martin (Stanford SLP3)",
                "duration": "PDF Ch. 9",
                "kind": "pdf",
            },
            {
                "title": "Stanford SLP3 Ch. 9 Official URL (web.stanford.edu/~jurafsky/slp3/9.pdf)",
                "url": "https://web.stanford.edu/~jurafsky/slp3/9.pdf",
                "video_id": "",
                "channel": "Stanford University",
                "duration": "Official PDF",
                "kind": "pdf",
            },
            {
                "title": "BERT Neural Network — Explained! (80/10/10 Masked LM & Fine-Tuning)",
                "url": "https://www.youtube.com/watch?v=xI0HHN5XKDo",
                "video_id": "xI0HHN5XKDo",
                "channel": "CodeEmporium",
                "duration": "13m",
                "kind": "youtube",
            },
            {
                "title": "Stanford CS224N: Pretraining, Masked Language Models (BERT) & RoBERTa",
                "url": "https://www.youtube.com/watch?v=knTc-UrMxI8",
                "video_id": "knTc-UrMxI8",
                "channel": "Stanford Online",
                "duration": "1h 20m",
                "kind": "youtube",
            },
        ],
        source="tutorial",
    ),
    RevisionNote(
        id="note-ecornell-post-training",
        problem_id="T15",
        problem_title="eCornell Post-Training: Full Alignment Pipeline, Reward Hacking, Length Bias & SimPO/ORPO/GRPO",
        title="🎓 eCornell LLM Post-Training Course — SFT, DPO/PPO/GRPO Alignment & Evaluation Hub",
        category="eCornell Post-Training",
        key_takeaways=[
            "Stage 1 (SFT & LoRA/QLoRA): Curate high-quality instruction pairs, mask prompt tokens (-100), and adapt attention/MLP projections via LoRA.",
            "Stage 2 (Preference Alignment): Compare PPO (online 4-model actor-critic) vs DPO (offline closed-form implicit reward) vs SimPO (length-normalized reference-free margin).",
            "Stage 3 (Reasoning & RLVR): Group Relative Policy Optimization (GRPO) samples G rollouts per prompt and normalizes rewards within the group, removing the Critic network.",
            "Stage 4 (Evaluation & Guardrails): Mitigate reward hacking, length/verbosity bias, and position bias in LLM-as-a-Judge benchmarks; upload your eCornell PDFs in the Course PDFs tab!",
        ],
        code_or_formula=(
            "# GRPO Group-Normalized Advantage (No Critic Network Needed):\n"
            "mean_r = np.mean(group_rewards, axis=-1, keepdims=True)\n"
            "std_r = np.std(group_rewards, axis=-1, keepdims=True)\n"
            "advantages = (group_rewards - mean_r) / (std_r + 1e-8)\n\n"
            "# SimPO Reference-Free Length-Normalized Margin Loss:\n"
            "margin = (beta / len_w) * logp_w - (beta / len_l) * logp_l - gamma\n"
            "loss = np.mean(np.logaddexp(0.0, -margin))"
        ),
        content=(
            "Dedicated module for your eCornell LLM Post-Training Course. You can upload any new eCornell course PDFs "
            "or lecture notes using the 'Course PDFs / eCornell' button above to automatically extract text, formulas, "
            "practice questions, and curated YouTube videos into your Reference Notes!"
        ),
        resources=[
            {
                "title": "Stanford SLP3 Ch. 8 PDF — Post-Training: SFT, LoRA, RLHF & DPO (Local PDF)",
                "url": "/materials/slp3_ch8_post_training.pdf",
                "video_id": "",
                "channel": "Jurafsky & Martin (Stanford SLP3)",
                "duration": "PDF Ch. 8",
                "kind": "pdf",
            },
            {
                "title": "DeepSeek-R1 & GRPO: Group Relative Policy Optimization Explained",
                "url": "https://www.youtube.com/watch?v=bAWV_yrqx4w",
                "video_id": "bAWV_yrqx4w",
                "channel": "Umar Jamil",
                "duration": "38m",
                "kind": "youtube",
            },
            {
                "title": "Andrej Karpathy — State of GPT (Pretraining, SFT, RLHF & Post-Training)",
                "url": "https://www.youtube.com/watch?v=bZQun8Y4L2A",
                "video_id": "bZQun8Y4L2A",
                "channel": "Andrej Karpathy",
                "duration": "42m",
                "kind": "youtube",
            },
        ],
        source="tutorial",
    ),
    RevisionNote(
        id="note-cme295-cheatsheet",
        problem_id="T16",
        problem_title="Stanford CME 295: Reasoning Scaling (Train vs. Test-Time 'Wait'), On-Policy Distillation (OPD) & GRPO / Dr. GRPO / DAPO",
        title="⚡ Stanford CME 295 VIP Cheatsheet — Transformers, MoE, RL (PPO/GRPO/Dr.GRPO/DAPO), Systems, ReAct/RAG, LaaJ & Diffusion LLMs",
        category="Stanford SLP3 & Post-Training",
        key_takeaways=[
            "Foundations & Transformers (Secs 1–3): BPE/Unigram subword tokenizers, Cosine similarity, MHA/GQA/MQA, RoPE, BERT [CLS] vs GPT [BOS], Mixture-of-Experts y_hat = sum G(x)_i E_i(x), Context Rot, and Temperature T.",
            "Training & Reasoning (Sec 4): CE Pretraining & Scaling Laws, SFT & LoRA (W_0 + BA), Best-of-N Rejection Sampling, Train-time RL scaling vs Test-time budget forcing ('Wait'), and On-Policy Distillation (OPD) with dense token-level teacher supervision.",
            "RL with LLMs (Sec 5): REINFORCE baseline R - b(s), PPO clipped surrogate, and GRPO group advantage A_hat_i = (R_i - mean)/std with Verifiable Rewards, plus Dr. GRPO (length bias fix) and DAPO (modified clipping + dynamic sampling).",
            "LLM Systems, Agents, Eval & Diffusion LLMs (Secs 6–9): FlashAttention (SRAM vs HBM), PagedAttention (fixed KV blocks), 4D Parallelism (Data/Tensor/Pipeline/Expert), Prefill vs Decode & Speculative Decoding, ReAct + RAG + Reranker, LLM-as-a-Judge biases (Position, Verbosity, Self-enhancement), and Discrete Masked Diffusion LLMs (dLLMs).",
        ],
        code_or_formula=(
            "# 1. Sparse Mixture-of-Experts (MoE) Top-K Routing (CME 295 Sec 3.1):\n"
            "# y_hat = sum_{i in TopK} softmax(r_topK)_i * E_i(x)\n\n"
            "# 2. GRPO Advantage & Objective (CME 295 Sec 5.3):\n"
            "A_hat = (R - R.mean()) / (R.std() + 1e-8)\n"
            "# L_GRPO = (1/G) sum_i E_t[ min(r_{i,t} A_hat_i, clip(r_{i,t}, 1-eps, 1+eps) A_hat_i) - beta D_KL(pi_theta || pi_ref) ]"
        ),
        content=(
            "Complete 6-page VIP Cheatsheet from Stanford CME 295 (Transformers & Large Language Models by Afshine Amidi & Shervine Amidi). "
            "Covers 1. Foundations (Tokens, Embeddings), 2. Transformers (MHA/GQA/MQA, RoPE, BERT/GPT/T5), 3. LLMs (MoE, Context Rot, Temperature), "
            "4. LLM Training (Pretraining, SFT, LoRA, RM/BoN, RLHF/DPO, Train vs Test-Time Reasoning Scaling, On-Policy Distillation OPD), "
            "5. RL with LLMs (REINFORCE, PPO, GRPO, Dr. GRPO, DAPO), 6. LLM Systems (FlashAttention, PagedAttention, Data/Tensor/Pipeline/Expert Parallelism, "
            "KV/Prompt Caching, Prefill vs Decode, Speculative Decoding), 7. AI Agents (ReAct, Harness, RAG & Rerankers), "
            "8. Evaluation (LLM-as-a-Judge Position/Verbosity/Self-enhancement biases, Component vs Trajectory agent eval), and 9. Diffusion LLMs (dLLMs)."
        ),
        resources=[
            {
                "title": "Stanford CME 295 VIP Cheatsheet: Transformers & Large Language Models (Local PDF)",
                "url": "/materials/stanford_cme295_cheatsheet_transformers_llms.pdf",
                "video_id": "",
                "channel": "Afshine Amidi & Shervine Amidi (Stanford CME 295)",
                "duration": "6-Page Cheatsheet PDF",
                "kind": "pdf",
            },
            {
                "title": "Stanford CME 295 Cheatsheet Official GitHub PDF",
                "url": "https://github.com/afshinea/stanford-cme-295-transformers-large-language-models/blob/main/en/cheatsheet-transformers-large-language-models.pdf",
                "video_id": "",
                "channel": "Stanford CME 295 GitHub",
                "duration": "Official PDF",
                "kind": "pdf",
            },
            {
                "title": "DeepSeek-R1, GRPO, Verifiable Rewards & Reasoning Scaling Explained",
                "url": "https://www.youtube.com/watch?v=DCqqCL29Bc8",
                "video_id": "DCqqCL29Bc8",
                "channel": "Yannic Kilcher",
                "duration": "1h 05m",
                "kind": "youtube",
            },
            {
                "title": "FlashAttention, KV Cache, PagedAttention & Speculative Decoding Explained",
                "url": "https://www.youtube.com/watch?v=IoGaGfU1VgQ",
                "video_id": "IoGaGfU1VgQ",
                "channel": "Umar Jamil",
                "duration": "49m",
                "kind": "youtube",
            },
        ],
        source="tutorial",
    ),
]


class SessionRecord(BaseModel):
    session_id: str = Field(default_factory=lambda: f"sess-{uuid.uuid4().hex[:10]}")
    problem_id: str
    mode: str = "tutor"
    persona_id: str = "persona-student"
    started_at: float = Field(default_factory=time.time)
    hints_used: list[int] = Field(default_factory=list)
    runs_count: int = 0
    submits_count: int = 0
    solved: bool = False
    resumption_handle: Optional[str] = None
    last_code: str = ""
    last_results: Optional[dict[str, Any]] = None
    scorecard: Optional[Scorecard] = None


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionRecord] = {}
        self._solved_ids: set[str] = set()
        self._pattern_stats: dict[str, dict[str, int]] = {}
        self._scorecards: list[Scorecard] = []
        self._notes: list[RevisionNote] = [n.model_copy() for n in BUILTIN_NOTES]
        self._personas: dict[str, UserPersona] = {p.id: p.model_copy() for p in BUILTIN_PERSONAS}
        self._personas_file = Path("/tmp/livecoach_personas.json")
        self._fs_client: Any = None
        if settings.use_firestore:
            try:
                from google.cloud import firestore  # type: ignore

                self._fs_client = firestore.Client(
                    project=settings.google_cloud_project or None
                )
            except Exception as e:
                print(f"[SessionStore] Firestore init failed, using memory: {e}")
        self._load_persisted_personas()

    def create_or_get(
        self,
        problem_id: str,
        mode: str = "tutor",
        session_id: Optional[str] = None,
    ) -> SessionRecord:
        if session_id and session_id in self._sessions:
            rec = self._sessions[session_id]
            rec.problem_id = problem_id
            rec.mode = mode
            return rec
        rec = SessionRecord(
            session_id=session_id or f"sess-{uuid.uuid4().hex[:10]}",
            problem_id=problem_id,
            mode=mode,
        )
        self._sessions[rec.session_id] = rec
        self._persist(rec)
        return rec

    def get(self, session_id: str) -> Optional[SessionRecord]:
        return self._sessions.get(session_id)

    def record_hint(self, session_id: str, level: int) -> None:
        rec = self._sessions.get(session_id)
        if not rec:
            return
        if level not in rec.hints_used:
            rec.hints_used.append(level)
        prob = problem_bank.get(rec.problem_id)
        if prob:
            for pat in prob.pattern:
                st = self._pattern_stats.setdefault(
                    pat, {"attempts": 0, "solved": 0, "hints": 0, "failed_runs": 0}
                )
                st["hints"] += 1
        self._persist(rec)

    def record_run(
        self,
        session_id: str,
        all_passed: bool,
        kind: str = "run",
        results: Optional[dict[str, Any]] = None,
    ) -> None:
        rec = self._sessions.get(session_id)
        if not rec:
            return
        if kind == "submit":
            rec.submits_count += 1
            if all_passed:
                rec.solved = True
                self._solved_ids.add(rec.problem_id)
        else:
            rec.runs_count += 1
        if results is not None:
            rec.last_results = results

        prob = problem_bank.get(rec.problem_id)
        if prob:
            for pat in prob.pattern:
                st = self._pattern_stats.setdefault(
                    pat, {"attempts": 0, "solved": 0, "hints": 0, "failed_runs": 0}
                )
                st["attempts"] += 1
                if kind == "submit" and all_passed:
                    st["solved"] += 1
                elif not all_passed:
                    st["failed_runs"] += 1
        self._persist(rec)

    def record_scorecard(self, session_id: str, scorecard: Scorecard) -> None:
        rec = self._sessions.get(session_id)
        if rec:
            scorecard.problem_id = rec.problem_id
            scorecard.mode = rec.mode
            rec.scorecard = scorecard
            self._persist(rec)
        self._scorecards.append(scorecard)

    def save_note(self, note: RevisionNote) -> RevisionNote:
        if note.problem_id and not note.problem_title:
            prob = problem_bank.get(note.problem_id)
            if prob:
                note.problem_title = prob.title
        # Update existing note if id matches, otherwise prepend
        for i, existing in enumerate(self._notes):
            if existing.id == note.id:
                self._notes[i] = note
                self._persist_note(note)
                return note
        self._notes.insert(0, note)
        self._persist_note(note)
        return note

    def list_notes(self, problem_id: Optional[str] = None) -> list[dict[str, Any]]:
        items = self._notes
        if problem_id:
            items = [n for n in items if n.problem_id == problem_id]
        return [n.model_dump() for n in items]

    def delete_note(self, note_id: str) -> bool:
        before = len(self._notes)
        self._notes = [n for n in self._notes if n.id != note_id]
        if self._fs_client:
            try:
                self._fs_client.collection("livecoach_notes").document(note_id).delete()
            except Exception:
                pass
        return len(self._notes) < before

    def pick_next_problem(
        self,
        current_id: Optional[str] = None,
        pattern: Optional[str] = None,
        difficulty: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        problems = problem_bank.list_all()
        candidates = [p for p in problems if p.id != current_id]
        if pattern:
            filtered = [p for p in candidates if pattern in p.pattern]
            if filtered:
                candidates = filtered
        if difficulty:
            filtered = [p for p in candidates if p.difficulty.lower() == difficulty.lower()]
            if filtered:
                candidates = filtered

        if not candidates:
            return None

        def score_problem(p: Any) -> tuple[int, int, str]:
            unsolved = 0 if p.id not in self._solved_ids else 1
            weakness = 0
            for pat in p.pattern:
                st = self._pattern_stats.get(pat, {})
                weakness -= st.get("failed_runs", 0) * 2 + st.get("hints", 0)
            return (unsolved, weakness, p.id)

        candidates.sort(key=score_problem)
        return candidates[0].to_list_item()

    def get_dashboard_stats(self) -> dict[str, Any]:
        return {
            "solved_ids": sorted(self._solved_ids),
            "pattern_stats": self._pattern_stats,
            "recent_scorecards": [s.model_dump() for s in self._scorecards[-10:]],
            "revision_notes": [n.model_dump() for n in self._notes],
            "active_sessions": len(self._sessions),
        }

    def list_personas(self) -> list[dict[str, Any]]:
        builtin_ids = {p.id for p in BUILTIN_PERSONAS}
        builtins = [self._personas[p.id].model_dump() for p in BUILTIN_PERSONAS if p.id in self._personas]
        customs = [
            p.model_dump()
            for pid, p in sorted(self._personas.items(), key=lambda kv: kv[1].created_at, reverse=True)
            if pid not in builtin_ids
        ]
        return builtins + customs

    def get_persona(self, persona_id: Optional[str] = None) -> UserPersona:
        if persona_id and persona_id in self._personas:
            return self._personas[persona_id]
        return self._personas.get("persona-student") or BUILTIN_PERSONAS[0]

    def save_persona(self, persona: UserPersona) -> UserPersona:
        builtin_ids = {p.id for p in BUILTIN_PERSONAS}
        if persona.id in builtin_ids:
            persona.is_builtin = True
        self._personas[persona.id] = persona
        self._persist_personas()
        return persona

    def delete_persona(self, persona_id: str) -> bool:
        builtin_ids = {p.id for p in BUILTIN_PERSONAS}
        if persona_id in builtin_ids or persona_id not in self._personas:
            return False
        del self._personas[persona_id]
        if self._fs_client:
            try:
                self._fs_client.collection("livecoach_personas").document(persona_id).delete()
            except Exception:
                pass
        self._persist_personas()
        return True

    def _load_persisted_personas(self) -> None:
        if self._personas_file.exists():
            try:
                data = json.loads(self._personas_file.read_text(encoding="utf-8"))
                for item in data:
                    p = UserPersona.model_validate(item)
                    self._personas[p.id] = p
            except Exception as e:
                print(f"[SessionStore] Could not read personas file: {e}")

    def _persist_personas(self) -> None:
        try:
            payload = [p.model_dump() for p in self._personas.values()]
            self._personas_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except Exception as e:
            print(f"[SessionStore] Could not write personas file: {e}")
        if self._fs_client:
            try:
                for p in self._personas.values():
                    self._fs_client.collection("livecoach_personas").document(p.id).set(
                        p.model_dump()
                    )
            except Exception as e:
                print(f"[SessionStore] Firestore persona write warning: {e}")

    def _persist(self, rec: SessionRecord) -> None:
        if not self._fs_client:
            return
        try:
            self._fs_client.collection("livecoach_sessions").document(rec.session_id).set(
                rec.model_dump()
            )
        except Exception as e:
            print(f"[SessionStore] Firestore write warning: {e}")

    def _persist_note(self, note: RevisionNote) -> None:
        if not self._fs_client:
            return
        try:
            self._fs_client.collection("livecoach_notes").document(note.id).set(
                note.model_dump()
            )
        except Exception as e:
            print(f"[SessionStore] Firestore note write warning: {e}")


session_store = SessionStore()
