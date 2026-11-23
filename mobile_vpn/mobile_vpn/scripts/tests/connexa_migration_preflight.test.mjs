import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPrivate, validateEnvironments, validateGateway, inspectTarget, target } from '../connexa_migration_preflight.mjs';

const prepared = { VPN_PROVIDER: 'cloudconnexa', CLOUDCONNEXA_BASE_URL: `https://${target.host}`,
  CLOUDCONNEXA_CLIENT_ID: 'test-client', CLOUDCONNEXA_CLIENT_SECRET: 'test-secret', CLOUDCONNEXA_ACCESS_GROUP_ID: target.group,
  DB_PASSWORD: 'test-db-secret' };
const row = { id: 25, name: 'Teste', management_ip_address: '10.200.0.2', vpn_provider: 'cloudconnexa',
  vpn_resources: { networkId: 'old-network', connectorId: 'old-connector', routeId: 'old-route' },
  cc_network_id: null, cc_connector_id: null, cc_ip_service_id: null };

test('requires private regular backup files and rejects symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'connexa-preflight-'));
  try {
    const file = join(dir, 'new.env');
    writeFileSync(file, 'private', { mode: 0o600 });
    assert.equal(readPrivate(file), 'private');
    chmodSync(file, 0o644);
    assert.throws(() => readPrivate(file), /private_backup_required/);
    chmodSync(file, 0o600);
    symlinkSync(file, join(dir, 'link'));
    assert.throws(() => readPrivate(join(dir, 'link')), /private_backup_required/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('refuses old/wrong accounts, unrelated env changes, duplicate or recreated gateways', () => {
  validateEnvironments(prepared, prepared);
  assert.throws(() => validateEnvironments(prepared, { ...prepared, CLOUDCONNEXA_BASE_URL: 'https://saganexus.api.openvpn.com' }), /wrong_target_account/);
  assert.throws(() => validateEnvironments(prepared, { ...prepared, DB_PASSWORD: 'changed' }), /unrelated_env_change/);
  assert.throws(() => validateGateway([row, row], { id: 25 }), /gateway_name_not_unique/);
  assert.throws(() => validateGateway([{ ...row, id: 26 }], { id: 25 }), /backup_gateway_mismatch/);
  assert.deepEqual(validateGateway([row], row), { id: 25, ip: '10.200.0.2', networkId: 'old-network' });
});

test('only OAuth POST and resource GETs; success explicitly does not permit migration', async () => {
  const calls = [];
  const gateway = validateGateway([row], row);
  const responses = [
    { access_token: 'test-token' },
    { id: target.network, connectors: [{ id: target.connector }] },
    { id: target.backendHost, connectors: [{ id: target.backendConnector }] },
    { id: target.service, networkId: target.network, routes: ['10.200.0.2/32'] },
    { id: target.group },
  ];
  const result = await inspectTarget(prepared, gateway, async (url, options) => {
    calls.push({ url, options });
    return Response.json(responses.shift());
  });
  assert.deepEqual(calls.map(({ options }) => options.method ?? 'GET'), ['POST', 'GET', 'GET', 'GET', 'GET']);
  assert.ok(calls.every(({ url, options }) => new URL(url).hostname === target.host && options.redirect === 'error' && options.signal));
  assert.equal(result.applyAllowed, false);
  assert.equal(result.migrationApplied, false);
  assert.equal(result.bindingAlreadyTargetsNewNetwork, false);
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
  assert.equal(JSON.stringify(result).includes('test-token'), false);
});

test('404 resources and wrong management IP fail closed', async () => {
  const gateway = validateGateway([row], row);
  await assert.rejects(() => inspectTarget(prepared, gateway, async (url) => url.endsWith('/token')
    ? Response.json({ access_token: 'test-token' }) : Response.json({}, { status: 404 })), /resource_http_404/);
  const responses = [{ access_token: 'test-token' }, { id: target.network, connectors: [{ id: target.connector }] },
    { id: target.backendHost, connectors: [{ id: target.backendConnector }] }, { id: target.service, networkId: target.network, routes: ['10.200.0.99/32'] }];
  await assert.rejects(() => inspectTarget(prepared, gateway, async () => Response.json(responses.shift())), /target_service_ip_mismatch/);
});

test('same ID cannot hide backup drift in identity, modern resources or legacy bindings', () => {
  for (const changes of [
    { name: 'Outro' }, { management_ip_address: '10.200.0.99' }, { vpn_provider: 'other' },
    ...['networkId', 'connectorId', 'routeId'].map((key) => ({ vpn_resources: { ...row.vpn_resources, [key]: 'different' } })),
    ...['cc_network_id', 'cc_connector_id', 'cc_ip_service_id'].map((key) => ({ [key]: 'different' })),
  ]) assert.throws(() => validateGateway([{ ...row, ...changes }], row), /backup_gateway_mismatch/);
  assert.throws(() => validateGateway([row], { id: row.id }), /backup_gateway_mismatch/);
  const legacy = { ...row, vpn_resources: null, cc_network_id: 'old-network', cc_connector_id: 'old-connector', cc_ip_service_id: 'old-route' };
  assert.equal(validateGateway([legacy], legacy).networkId, 'old-network');
});

test('service association must explicitly match the target network, never only its ID and IP', async () => {
  for (const association of [{ networkId: 'other-network' }, {}]) {
    const responses = [{ access_token: 'test-token' }, { id: target.network, connectors: [{ id: target.connector }] },
      { id: target.backendHost, connectors: [{ id: target.backendConnector }] },
      { id: target.service, ...association, routes: ['10.200.0.2/32'] }];
    await assert.rejects(() => inspectTarget(prepared, validateGateway([row], row), async () => Response.json(responses.shift())), /target_service_network_mismatch/);
  }
});

test('preflight remains read-only by default and never exposes credentials', async () => {
  const result = await inspectTarget(prepared, validateGateway([row], row), async (url) => {
    const responses = [{ access_token: 'test-token' }, { id: target.network, connectors: [{ id: target.connector }] },
      { id: target.backendHost, connectors: [{ id: target.backendConnector }] }, { id: target.service, networkId: target.network, routes: ['10.200.0.2/32'] }, { id: target.group }];
    return Response.json(responses[url.endsWith('/token') ? 0 : url.includes('/networks/') && !url.includes('ip-services') ? 1 : url.includes('/hosts/') ? 2 : url.includes('/ip-services/') ? 3 : 4]);
  });
  assert.equal(result.applyAllowed, false);
  assert.equal(result.migrationApplied, false);
});
