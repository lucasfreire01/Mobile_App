import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchWithTimeout } from '../src/lib/fetch-with-timeout.ts';

test('preserves the Response, authorization and JSON error contract', async (t) => {
  const response = new Response(JSON.stringify({ errors: [{ message: 'API error' }] }), { status: 503 });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.example.test/gateways');
    assert.equal(options.headers.Authorization, 'Bearer fixture');
    return response;
  });
  const actual = await fetchWithTimeout('https://api.example.test/gateways', { headers: { Authorization: 'Bearer fixture' } });
  assert.equal(actual, response);
  assert.equal(actual.status, 503);
  assert.equal((await actual.json()).errors[0].message, 'API error');
});

test('a fetch that never settles still times out and aborts', async (t) => {
  let signal;
  t.mock.method(globalThis, 'fetch', (_url, options) => { signal = options.signal; return new Promise(() => {}); });
  await assert.rejects(fetchWithTimeout('https://api.example.test/gateways', undefined, 20), /demorou para responder/);
  assert.equal(signal.aborted, true);
});

test('a response with a stalled JSON body also times out', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start() {} })));
  await assert.rejects(fetchWithTimeout('https://api.example.test/gateways', undefined, 20), /demorou para responder/);
});

test('forwards caller cancellation without retaining its event listener', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
  }));
  const request = fetchWithTimeout('https://api.example.test/gateways', { signal: controller.signal }, 1000);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});
