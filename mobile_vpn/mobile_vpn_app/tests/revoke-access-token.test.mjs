import assert from 'node:assert/strict';
import test from 'node:test';
import { revokeAccessToken } from '../src/lib/fetch-with-timeout.ts';

test('logout sends the captured token to the server revocation endpoint', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.example.test/api/v1/account/logout');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer session-fixture');
    return new Response('{}', { status: 200 });
  });
  await revokeAccessToken('https://api.example.test/api/v1', 'session-fixture');
});

test('an already invalid token completes logout', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 401 }));
  await revokeAccessToken('https://api.example.test/api/v1', 'expired-fixture');
});

test('server and network failures do not report successful revocation', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await assert.rejects(revokeAccessToken('https://api.example.test', 'fixture'), /revogar/);
  fetchMock.mock.mockImplementation(async () => { throw new Error('offline'); });
  await assert.rejects(revokeAccessToken('https://api.example.test', 'fixture'), /offline/);
});
