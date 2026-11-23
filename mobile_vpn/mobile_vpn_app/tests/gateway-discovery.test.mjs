import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Keep production imports compatible with Metro; resolve their TS files for Node.
const sourceUrl = new URL('../src/lib/gateway-discovery.ts', import.meta.url);
const source = (await readFile(sourceUrl, 'utf8')).replace(
  /from "(\.\/[^"\n]+)"/g,
  (_, path) => `from "${new URL(`${path}.ts`, sourceUrl).href}"`,
);
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { discoverLocalBridges, discoverLocalGateways } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const identity = {
  service: 'saganexus-lan-bridge-v1', pc: { model: 'PC', username: 'user' },
  gateways: [{ ip: '10.42.0.2', model: 'Browan', mac: '00:16:16:2b:c7:26', port: 8800 }],
};

test('publishes a bridge and starts the next host while other probes are pending', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const pending = [];
  const calls = [];
  let active = 0;
  let peak = 0;
  let published;
  const firstFound = new Promise((resolve) => { published = resolve; });
  let lastStarted;
  const nextStarted = new Promise((resolve) => { lastStarted = resolve; });
  globalThis.fetch = async (url) => {
    const host = new URL(url).hostname;
    calls.push(host);
    active++;
    peak = Math.max(peak, active);
    if (host === '10.0.0.1') { active--; return Response.json(identity); }
    if (host === '10.0.0.25') lastStarted();
    await new Promise((resolve) => pending.push(resolve));
    active--;
    return Response.json({}, { status: 404 });
  };
  const hosts = Array.from({ length: 25 }, (_, i) => `10.0.0.${i + 1}`);
  const found = [];
  const scan = discoverLocalBridges([hosts[0], ...hosts, 'invalid', '256.0.0.1'], 5000, (bridge) => {
    found.push(bridge);
    published();
  });
  try {
    await Promise.race([Promise.all([firstFound, nextStarted]), new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('discovery waited for the batch')), 1000);
      timer.unref();
    })]);
    assert.equal(found[0].host, hosts[0]);
    assert.equal(found[0].gateways[0].bridgePort, 8800);
                   assert.equal(active, 24);
                   assert.ok(peak <= 24);
    assert.deepEqual(calls, hosts);
  } finally {
    pending.forEach((resolve) => resolve());
    await scan;
  }
  assert.deepEqual(await scan, found);
});

test('empty input and discovery only uses the external bridge', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url.includes(':8787/')) return Response.json({}, { status: 404 });
    return Response.json(identity.gateways[0]);
  };
  assert.deepEqual(await discoverLocalBridges([]), []);
  assert.equal(calls.length, 0);
           const gateways = await discoverLocalGateways(['10.42.0.2']);
           assert.deepEqual(gateways, []);
           assert.equal(calls.length, 1);
});
