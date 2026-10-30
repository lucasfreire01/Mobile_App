#!/usr/bin/env python3
"""Bounded local LightRAG retrieval with explicit lexical fallback."""
import argparse
import json
import re
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
VAULT = ROOT / "knowledge" / "SagaNexus"
STOP = {"a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "para", "por", "com", "no", "na", "um", "uma", "qual", "como"}


def words(value):
    normalized = unicodedata.normalize("NFKD", value.lower())
    normalized = "".join(c for c in normalized if not unicodedata.combining(c))
    return set(re.findall(r"[a-z0-9_]+", normalized)) - STOP


def lexical_search(query, limit=2, max_chars=1800):
    terms = words(query[:300])
    limit = max(1, min(int(limit), 3))
    budget = max(200, min(int(max_chars), 3000))
    ranked = []
    for path in sorted(VAULT.glob("*.md")):
        if path.is_symlink() or not path.resolve().is_relative_to(VAULT.resolve()):
            continue
        content = path.read_text(encoding="utf-8")
        score = len(terms & words(content)) + 3 * len(terms & words(path.stem))
        if score:
            ranked.append((score, path, content))
    ranked.sort(key=lambda item: (-item[0], item[1].name))
    results = []
    for score, path, content in ranked[:limit]:
        if not budget:
            break
        lines = content.splitlines(keepends=True)
        hit = next((i for i, line in enumerate(lines) if terms & words(line)), 0)
        start = max(0, hit - 1)
        excerpt = "".join(lines[start:])[:budget]
        results.append({"note": path.stem, "path": str(path.relative_to(ROOT)), "line": start + 1, "score": score, "excerpt": excerpt, "truncated": len(excerpt) < len(content)})
        budget -= len(excerpt)
    return {"engine": "local-lexical-not-lightrag", "results": results, "returned_chars": sum(len(r["excerpt"]) for r in results)}


def search(query, limit=2, max_chars=1800):
    from urllib.request import urlopen
    from urllib.parse import urlencode
    from urllib.error import URLError
    limit = max(1, min(int(limit), 3))
    max_chars = max(200, min(int(max_chars), 3000))
    params = urlencode({"q": query[:300], "limit": limit, "max_chars": max_chars})
    try:
        with urlopen("http://127.0.0.1:8768/search?" + params, timeout=240) as response:
            result = json.loads(response.read(65536))
        if result.get("engine") != "lightrag-local" or result.get("returned_chars", max_chars + 1) > max_chars:
            raise ValueError("Invalid bounded LightRAG result")
        return result
    except (URLError, TimeoutError, ValueError, OSError):
        result = lexical_search(query, limit, max_chars)
        result["fallback_reason"] = "local_lightrag_unavailable"
        return result


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        request = urlsplit(self.path)
        if request.path == "/health":
            body, status = {"status": "ok", "engine": "local-lexical-not-lightrag"}, 200
        elif request.path == "/search":
            params = parse_qs(request.query)
            try:
                body = search(params.get("q", [""])[0], params.get("limit", ["2"])[0], params.get("max_chars", ["1800"])[0])
                status = 200
            except (ValueError, OverflowError):
                body, status = {"error": "Invalid search limits"}, 400
        else:
            body, status = {"error": "Not found"}, 404
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["search", "serve"])
    parser.add_argument("query", nargs="?", default="")
    parser.add_argument("--limit", type=int, default=2)
    parser.add_argument("--max-chars", type=int, default=1800)
    parser.add_argument("--port", type=int, default=8767)
    args = parser.parse_args()
    if args.action == "search":
        print(json.dumps(search(args.query, args.limit, args.max_chars), ensure_ascii=False))
    else:
        print(f"Curated project memory: http://127.0.0.1:{args.port}", flush=True)
        ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
