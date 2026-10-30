#!/usr/bin/env python3
"""Local LightRAG over curated Obsidian notes only; no paid inference APIs."""
import asyncio
import hashlib
import inspect
import json
import logging
import re
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import numpy as np
from lightrag import LightRAG, QueryParam
from lightrag.utils import EmbeddingFunc

ROOT = Path(__file__).resolve().parents[1]
VAULT = ROOT / 'knowledge' / 'SagaNexus'
STATE = Path.home() / '.local/share/saganexus-rag'
MODELS = json.loads((STATE / 'models.json').read_text())
HOST = MODELS['ollamaUrl']
if urlsplit(HOST).hostname not in ('127.0.0.1', 'localhost'):
    raise ValueError('Inference must stay on localhost')
logging.basicConfig(level=logging.WARNING)
logging.getLogger('lightrag').setLevel(logging.WARNING)
INFERENCE = asyncio.Lock()
INDEX_LOCK = asyncio.Lock()
SEARCH_LOCK = asyncio.Lock()
RAG = None
META = {}


def post(path, payload):
    req = urllib.request.Request(HOST + path, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=240) as response:
        return json.load(response)


async def embed(texts):
    async with INFERENCE:
        result = await asyncio.to_thread(post, '/api/embed', {'model': MODELS['embeddingModel'], 'input': texts, 'keep_alive': '120s', 'options': {'num_thread': 2}})
        return np.asarray(result['embeddings'], dtype=np.float32)


async def complete(prompt, system_prompt=None, history_messages=None, **kwargs):
    messages = ([{'role': 'system', 'content': system_prompt}] if system_prompt else []) + (history_messages or []) + [{'role': 'user', 'content': prompt}]
    payload = {'model': MODELS['llmModel'], 'messages': messages, 'stream': False, 'keep_alive': 0, 'options': {'num_thread': 2, 'num_ctx': 4096, 'num_predict': 512, 'temperature': 0}}
    if kwargs.get('keyword_extraction'):
        payload['format'] = 'json'
    async with INFERENCE:
        result = await asyncio.to_thread(post, '/api/chat', payload)
        return result['message']['content']


def corpus():
    notes = []
    digest = hashlib.sha256(b'obsidian-kg-v2' + json.dumps(MODELS, sort_keys=True).encode())
    for path in sorted(VAULT.glob('*.md')):
        if path.is_symlink() or not path.resolve().is_relative_to(VAULT.resolve()):
            continue
        content = path.read_text(encoding='utf-8')
        relative = str(path.relative_to(ROOT))
        notes.append((path.stem, relative, content))
        digest.update((relative + '\0' + content).encode())
    return notes, digest.hexdigest()[:20]


def graph(notes):
    chunks, entities, relations = [], [], []
    names = {name for name, _, _ in notes}
    edges = set()
    for name, path, content in notes:
        start, buffer, order = 1, '', 0
        for number, line in enumerate(content.splitlines(keepends=True), 1):
            if buffer and len(buffer) + len(line) > 1200:
                chunks.append({'content': f'NOTE_PATH={path}\nNOTE_LINE={start}\n{buffer}', 'source_id': f'{path}:{start}', 'file_path': path, 'chunk_order_index': order})
                start, buffer, order = number, '', order + 1
            buffer += line
        if buffer:
            chunks.append({'content': f'NOTE_PATH={path}\nNOTE_LINE={start}\n{buffer}', 'source_id': f'{path}:{start}', 'file_path': path, 'chunk_order_index': order})
        source = f'{path}:1'
        entities.append({'entity_name': name, 'entity_type': 'project_note', 'description': content[:800], 'source_id': source, 'file_path': path})
        for link in re.findall(r'\[\[([^\]]+)\]\]', content):
            target = link.split('|')[0].split('#')[0]
            if target in names and target != name and (name, target) not in edges:
                edges.add((name, target))
                relations.append({'src_id': name, 'tgt_id': target, 'description': f'{name} referencia {target} no vault Obsidian.', 'keywords': 'obsidian,reference', 'weight': 1.0, 'source_id': source, 'file_path': path})
    return {'chunks': chunks, 'entities': entities, 'relationships': relations}


async def ensure_index():
    global RAG, META
    async with INDEX_LOCK:
        notes, fingerprint = corpus()
        if RAG is not None and META.get('fingerprint') == fingerprint:
            return
        working = STATE / 'indexes' / fingerprint
        working.mkdir(parents=True, exist_ok=True)
        options = {'working_dir': str(working), 'workspace': fingerprint, 'llm_model_func': complete, 'llm_model_name': MODELS['llmModel'], 'llm_model_max_async': 1, 'embedding_func': EmbeddingFunc(embedding_dim=MODELS['embeddingDimensions'], max_token_size=2048, func=embed), 'embedding_func_max_async': 1, 'embedding_batch_num': 2, 'max_parallel_insert': 1}
        supported = inspect.signature(LightRAG).parameters
        rag = LightRAG(**{key: value for key, value in options.items() if key in supported})
        await rag.initialize_storages()
        marker = working / 'curated-index.json'
        if not marker.exists():
            kg = graph(notes)
            await rag.ainsert_custom_kg(kg, full_doc_id='obsidian-' + fingerprint)
            metadata = {'fingerprint': fingerprint, 'documents': len(notes), 'chunks': len(kg['chunks']), 'entities': len(kg['entities']), 'relationships': len(kg['relationships'])}
            marker.write_text(json.dumps(metadata, indent=2) + '\n')
        else:
            metadata = json.loads(marker.read_text())
        if RAG is not None:
            await RAG.finalize_storages()
        RAG, META = rag, metadata
        (STATE / 'retrieval-status.json').write_text(json.dumps({'engine': 'lightrag-local', 'ready': True, **META}, indent=2) + '\n')


async def _search(query, limit=2, max_chars=1800):
    query = query.strip()[:300]
    limit, max_chars = max(1, min(int(limit), 3)), max(200, min(int(max_chars), 3000))
    if not query:
        return {'engine': 'lightrag-local', 'results': [], 'returned_chars': 0}
    await ensure_index()
    options = {'mode': 'naive', 'top_k': 8, 'chunk_top_k': 8, 'enable_rerank': False, 'max_total_tokens': 4096}
    result = await RAG.aquery_data(query, param=QueryParam(**{key: value for key, value in options.items() if key in inspect.signature(QueryParam).parameters}))
    if result.get('status') not in (None, 'success'):
        raise RuntimeError('LightRAG retrieval failed')
    hits, seen = [], set()
    for chunk in result.get('data', {}).get('chunks', []):
        content = chunk.get('content', '')
        match = re.match(r'NOTE_PATH=(.+)\nNOTE_LINE=(\d+)\n', content)
        if not match:
            continue
        path, line = match.group(1), int(match.group(2))
        if path in seen or not (ROOT / path).resolve().is_relative_to(VAULT.resolve()):
            continue
        seen.add(path)
        excerpt = content[match.end():][:max_chars // limit]
        hits.append({'note': Path(path).stem, 'path': path, 'line': line, 'excerpt': excerpt, 'truncated': len(content) - match.end() > len(excerpt)})
        if len(hits) >= limit:
            break
    return {'engine': 'lightrag-local', 'mode': 'semantic', 'results': hits, 'returned_chars': sum(len(hit['excerpt']) for hit in hits)}


async def search(query, limit=2, max_chars=1800):
    async with SEARCH_LOCK:
        return await _search(query, limit, max_chars)


if __name__ == '__main__':
    loop = asyncio.new_event_loop()
    loop.run_until_complete(ensure_index())
    threading.Thread(target=loop.run_forever, daemon=True).start()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            request = urlsplit(self.path)
            try:
                if request.path == '/health':
                    body = {'engine': 'lightrag-local', 'ready': True, 'inference': HOST, **META}
                elif request.path == '/search':
                    params = parse_qs(request.query)
                    body = asyncio.run_coroutine_threadsafe(search(params.get('q', [''])[0], params.get('limit', [2])[0], params.get('max_chars', [1800])[0]), loop).result(timeout=240)
                else:
                    self.send_error(404)
                    return
                status = 200
            except Exception as error:
                body, status = {'engine': 'lightrag-local', 'error': type(error).__name__}, 503
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_args):
            pass

    print(json.dumps({'engine': 'lightrag-local', 'url': 'http://127.0.0.1:8768', **META}), flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8768), Handler).serve_forever()
