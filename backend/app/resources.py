import asyncio
import json
import re
import urllib.parse
import urllib.request
from typing import Any


CURATED_DOCS: list[dict[str, str]] = [
    {
        "keywords": "cram sft grpo exploration wall reward hacking samb macro-f1 qlora nf4 gemma directive shield interview",
        "title": "CRAM: SFT and GRPO, in plain English (2-Page Interview Cheat Sheet HTML)",
        "url": "/materials/interview-sft-grpo-explainer.html",
        "channel": "CRAM Interview Prep",
        "kind": "docs",
    },
    {
        "keywords": "cram sft grpo exploration wall reward hacking samb macro-f1 qlora nf4 gemma directive shield interview",
        "title": "CRAM: SFT and GRPO, explained properly (Full 12-Section Interview Guide HTML)",
        "url": "/materials/interview-sft-grpo-explained.html",
        "channel": "CRAM Interview Prep",
        "kind": "docs",
    },
    {
        "keywords": "slp3 post-training post_training sft lora rlhf ppo dpo bradley terry reward alignment ecornell",
        "title": "Stanford SLP3 Ch. 8 PDF — Post-Training: SFT, LoRA, RLHF (PPO) & DPO (Local PDF)",
        "url": "/materials/slp3_ch8_post_training.pdf",
        "channel": "Jurafsky & Martin (Stanford SLP3)",
        "kind": "pdf",
    },
    {
        "keywords": "slp3 post-training post_training sft lora rlhf ppo dpo bradley terry reward alignment ecornell",
        "title": "Stanford SLP3 Ch. 8 Official URL (web.stanford.edu/~jurafsky/slp3/8.pdf)",
        "url": "https://web.stanford.edu/~jurafsky/slp3/8.pdf",
        "channel": "Stanford University",
        "kind": "pdf",
    },
    {
        "keywords": "transformer attention self-attention multi-head kv cache residual pre-ln rope flashattention",
        "title": "Stanford SLP3 Transformer & Self-Attention Lecture Slides PDF (Local PDF)",
        "url": "/materials/slp3_transformer_slides_aug26.pdf",
        "channel": "Jurafsky & Martin (Stanford SLP3 Slides)",
        "kind": "pdf",
    },
    {
        "keywords": "transformer attention self-attention multi-head kv cache residual pre-ln rope flashattention",
        "title": "Stanford SLP3 Transformer Slides Official URL (transformer_aug26.pdf)",
        "url": "https://web.stanford.edu/~jurafsky/slp3/slides/transformer_aug26.pdf",
        "channel": "Stanford University",
        "kind": "pdf",
    },
    {
        "keywords": "bert masked lm mlm bidirectional cloze cls ner bio roberta deberta",
        "title": "Stanford SLP3 Ch. 9 PDF — Masked Language Models (BERT) (Local PDF)",
        "url": "/materials/slp3_ch9_masked_lm.pdf",
        "channel": "Jurafsky & Martin (Stanford SLP3)",
        "kind": "pdf",
    },
    {
        "keywords": "bert masked lm mlm bidirectional cloze cls ner bio roberta deberta",
        "title": "Stanford SLP3 Ch. 9 Official URL (web.stanford.edu/~jurafsky/slp3/9.pdf)",
        "url": "https://web.stanford.edu/~jurafsky/slp3/9.pdf",
        "channel": "Stanford University",
        "kind": "pdf",
    },
    {
        "keywords": "cme295 cme 295 cheatsheet transformers llm moe rope sft lora rlhf ppo grpo dr.grpo dapo opd flashattention pagedattention speculative decoding react rag laaj diffusion dllm",
        "title": "Stanford CME 295 VIP Cheatsheet: Transformers & Large Language Models (Local PDF)",
        "url": "/materials/stanford_cme295_cheatsheet_transformers_llms.pdf",
        "channel": "Afshine Amidi & Shervine Amidi (Stanford CME 295)",
        "kind": "pdf",
    },
    {
        "keywords": "cme295 cme 295 cheatsheet transformers llm moe rope sft lora rlhf ppo grpo dr.grpo dapo opd flashattention pagedattention speculative decoding react rag laaj diffusion dllm",
        "title": "Stanford CME 295 Cheatsheet Official GitHub PDF (afshinea/stanford-cme-295-transformers-large-language-models)",
        "url": "https://github.com/afshinea/stanford-cme-295-transformers-large-language-models/blob/main/en/cheatsheet-transformers-large-language-models.pdf",
        "channel": "Stanford CME 295 GitHub",
        "kind": "pdf",
    },
    {
        "keywords": "dict hashmap hash map dictionary counter defaultdict set",
        "title": "Python Official Docs — Dictionaries (dict) & Mapping Types",
        "url": "https://docs.python.org/3/tutorial/datastructures.html#dictionaries",
        "channel": "docs.python.org",
        "kind": "docs",
    },
    {
        "keywords": "counter defaultdict deque ordereddict collections",
        "title": "Python collections — Counter, defaultdict, deque",
        "url": "https://docs.python.org/3/library/collections.html",
        "channel": "docs.python.org",
        "kind": "docs",
    },
    {
        "keywords": "heap heapq priority queue top k median",
        "title": "Python heapq — Heap Queue / Priority Queue Algorithm",
        "url": "https://docs.python.org/3/library/heapq.html",
        "channel": "docs.python.org",
        "kind": "docs",
    },
    {
        "keywords": "bisect binary search sorted array lower_bound upper_bound",
        "title": "Python bisect — Array Bisection / Binary Search",
        "url": "https://docs.python.org/3/library/bisect.html",
        "channel": "docs.python.org",
        "kind": "docs",
    },
    {
        "keywords": "dynamic programming dp memoization lru_cache cache",
        "title": "Python functools.cache & lru_cache for Top-Down DP",
        "url": "https://docs.python.org/3/library/functools.html#functools.cache",
        "channel": "docs.python.org",
        "kind": "docs",
    },
]



def _fetch_youtube_sync(query: str, max_results: int = 4) -> list[dict[str, Any]]:
    search_q = query.strip()
    if "tutorial" not in search_q.lower() and "python" not in search_q.lower():
        search_q = f"{search_q} python tutorial"
    encoded = urllib.parse.quote_plus(search_q)
    url = f"https://www.youtube.com/results?search_query={encoded}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    results: list[dict[str, Any]] = []
    try:
        html = (
            urllib.request.urlopen(req, timeout=6)
            .read()
            .decode("utf-8", errors="ignore")
        )
        m = re.search(r"var ytInitialData = (\{.*?\});</script>", html)
        if m:
            data = json.loads(m.group(1))
            contents = (
                data.get("contents", {})
                .get("twoColumnSearchResultsRenderer", {})
                .get("primaryContents", {})
                .get("sectionListRenderer", {})
                .get("contents", [])
            )
            for section in contents:
                items = section.get("itemSectionRenderer", {}).get("contents", [])
                for item in items:
                    v = item.get("videoRenderer")
                    if not v or not v.get("videoId"):
                        continue
                    vid = v["videoId"]
                    title = "".join(
                        r.get("text", "") for r in v.get("title", {}).get("runs", [])
                    )
                    channel = "".join(
                        r.get("text", "")
                        for r in v.get("ownerText", {}).get("runs", [])
                    )
                    duration = v.get("lengthText", {}).get("simpleText", "")
                    if not title:
                        continue
                    results.append(
                        {
                            "title": title,
                            "url": f"https://www.youtube.com/watch?v={vid}",
                            "video_id": vid,
                            "channel": channel or "YouTube",
                            "duration": duration or "Video",
                            "kind": "youtube",
                        }
                    )
                    if len(results) >= max_results:
                        return results
    except Exception as e:
        print(f"[Resources] YouTube search warning: {e}")

    if not results:
        results.append(
            {
                "title": f"YouTube Search: {search_q}",
                "url": f"https://www.youtube.com/results?search_query={encoded}",
                "video_id": "",
                "channel": "YouTube",
                "duration": "Search",
                "kind": "youtube",
            }
        )
    return results


async def search_learning_resources(
    query: str, max_results: int = 5
) -> list[dict[str, Any]]:
    yt_results = await asyncio.to_thread(_fetch_youtube_sync, query, max_results)
    q_lower = query.lower()
    matched_docs: list[dict[str, Any]] = []
    for doc in CURATED_DOCS:
        if any(tok in q_lower for tok in doc["keywords"].split()):
            matched_docs.append(
                {
                    "title": doc["title"],
                    "url": doc["url"],
                    "video_id": "",
                    "channel": doc["channel"],
                    "duration": "Docs",
                    "kind": doc["kind"],
                }
            )
    return yt_results + matched_docs[:2]
