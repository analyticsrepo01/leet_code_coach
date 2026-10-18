import asyncio
import json
import re
import urllib.parse
import urllib.request
from typing import Any


CURATED_DOCS: list[dict[str, str]] = [
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
