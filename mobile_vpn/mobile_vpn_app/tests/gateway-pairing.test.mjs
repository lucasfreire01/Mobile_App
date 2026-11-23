import assert from 'node:assert/strict';
import test from 'node:test';
import { pairGateway, isBridgePairingSession, PairingConfirmationPending } from '../src/lib/gateway-pairing.ts';

const session = () => ({ sessionId: '12345678-1234-1234-1234-123456789abc', expiresAt: Date.now() + 60_000 });
const mac = '00:16:16:2b:c7:26';
function fixture({ relay = 'submitted', online = true } = {}) {
  const calls = [];
  const events = [];
  const controller = new AbortController();
  const options = {
    apiUrl: 'https://backend.example/api/v1', session: session(),
    gatewayId: 24, gatewayMac: mac, enrollmentCode: 'T'.repeat(43), signal: controller.signal,
    onEvent: (event) => events.push(event), wait: async () => {},
    apiFetch: async (url, init) => {
      calls.push({ url, init });
      assert.equal(new URL(url).origin, 'https://backend.example');
      assert.equal(init.redirect, 'error');
      if (url.endsWith('/approve')) return Response.json({ status: 'approved' });
      if (url.endsWith('/gateways/24')) return Response.json({ gateway: { status: online ? 'online' : 'offline' } });
      return Response.json({ status: relay });
    },
  };
  return { options, calls, events, controller };
}

test('approves only the selected PC/gateway over HTTPS and waits for real online confirmation', async () => {
  const f = fixture();
  await pairGateway(f.options);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { gatewayId: 24, gatewayMac: mac, enrollmentCode: 'T'.repeat(43) });
  assert.equal(Object.hasOwn(JSON.parse(f.calls[0].init.body), 'confirmationCode'), false);
  assert.deepEqual(f.events, ['authorized', 'submitted', 'online']);
});

test('invalid or expired sessions and HTTP never send the enrollment code', async () => {
  for (const override of [
    { apiUrl: 'http://backend.example/api/v1' },
    { session: { ...session(), expiresAt: Date.now() - 1 } },
    { session: { ...session(), sessionId: '../../other' } },
  ]) {
    const f = fixture();
    await assert.rejects(() => pairGateway({ ...f.options, ...override }));
    assert.equal(f.calls.length, 0);
  }
});

test('rejects forged discovery metadata and accepts only a live session identifier', () => {
  assert.equal(isBridgePairingSession(session()), true);
  for (const value of [null, {}, { ...session(), expiresAt: Infinity }, { ...session(), sessionId: 'bad' }]) {
    assert.equal(isBridgePairingSession(value), false);
  }
});

test('a failed relay cannot produce a gateway-online success event', async () => {
  const f = fixture({ relay: 'failed' });
  await assert.rejects(() => pairGateway(f.options), /ponte não conseguiu/);
  assert.deepEqual(f.events, ['authorized']);
  assert.equal(f.calls.some((call) => call.url.endsWith('/gateways/24')), false);
});

test('receipt with an offline gateway becomes pending instead of reporting failure or success', async () => {
  const f = fixture({ online: false });
  await assert.rejects(() => pairGateway({ ...f.options, timeoutMs: 15, wait: async () => { await new Promise((resolve) => setTimeout(resolve, 20)); } }), PairingConfirmationPending);
  assert.deepEqual(f.events, ['authorized', 'submitted']);
});

test('keeps observing after pending until real online without approving twice', async () => {
  const f = fixture({ online: false });
  const apiFetch = f.options.apiFetch;
  let pendingCount = 0;
  let pendingReads = 0;
  await pairGateway({ ...f.options, timeoutMs: 15,
    onPending: () => {
      pendingCount++;
      assert.deepEqual(f.events, ['authorized', 'submitted']);
    },
    wait: async () => { await new Promise((resolve) => setTimeout(resolve, 20)); },
    apiFetch: async (url, init) => {
      const response = await apiFetch(url, init);
      if (url.endsWith('/gateways/24') && pendingCount) {
        pendingReads++;
        if (pendingReads === 1) return new Promise(() => {});
        return Response.json({ gateway: { status: 'online' } });
      }
      return response;
    },
  });
  assert.equal(pendingCount, 1);
  assert.equal(pendingReads, 2);
  assert.equal(f.calls.filter((call) => call.init.method === 'POST').length, 1);
  assert.deepEqual(f.events, ['authorized', 'submitted', 'online']);
});

test('aborting after pending stops observation without completing or approving twice', async () => {
  const f = fixture({ online: false });
  let pendingCount = 0;
  await assert.rejects(() => pairGateway({ ...f.options, timeoutMs: 15,
    onPending: () => { pendingCount++; f.controller.abort(); },
    wait: async (signal) => {
      if (signal.aborted) throw new Error('Pareamento interrompido.');
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
  }), /Pareamento interrompido/);
  assert.equal(pendingCount, 1);
  assert.equal(f.calls.filter((call) => call.init.method === 'POST').length, 1);
  assert.deepEqual(f.events, ['authorized', 'submitted']);
});

test('abort interrupts polling without a success event', async () => {
  const f = fixture({ relay: 'approved' });
  await assert.rejects(() => pairGateway({ ...f.options, wait: async () => { f.controller.abort(); } }));
  assert.deepEqual(f.events, ['authorized']);
  assert.equal(f.calls.length, 2);
});

test('an HTTP rejection never emits an authorization event', async () => {
  const f = fixture();
  await assert.rejects(() => pairGateway({ ...f.options, apiFetch: async () => Response.json({}, { status: 403 }) }), /não está autorizada/);
  assert.deepEqual(f.events, []);
});

test('a stalled approval times out and aborts the request without inventing events', async () => {
  const f = fixture();
  let requestSignal;
  await assert.rejects(() => pairGateway({ ...f.options, timeoutMs: 20,
    apiFetch: async (_, init) => { requestSignal = init.signal; return new Promise(() => {}); },
  }), /não concluiu a entrega a tempo/);
  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(f.events, []);
});

test('a stalled online response body times out after the real receipt', async () => {
  const f = fixture();
  const apiFetch = f.options.apiFetch;
  let requestSignal;
  await assert.rejects(() => pairGateway({ ...f.options, timeoutMs: 20,
    apiFetch: async (url, init) => {
      if (url.endsWith('/gateways/24')) {
        requestSignal = init.signal;
        return { ok: true, json: () => new Promise(() => {}) };
      }
      return apiFetch(url, init);
    },
  }), PairingConfirmationPending);
  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(f.events, ['authorized', 'submitted']);
});

test('abort settles a stalled request even when the transport ignores its signal', async () => {
  const f = fixture();
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  let requestSignal;
  const pairing = pairGateway({ ...f.options,
    apiFetch: async (_, init) => { requestSignal = init.signal; started(); return new Promise(() => {}); },
  });
  const rejected = assert.rejects(pairing, /Pareamento interrompido/);
  await ready;
  f.controller.abort();
  await rejected;
  assert.equal(requestSignal.aborted, true);
  assert.deepEqual(f.events, []);
});
