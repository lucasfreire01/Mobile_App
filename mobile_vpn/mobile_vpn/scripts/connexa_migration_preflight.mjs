#!/usr/bin/env node
// Read-only diagnostic. A successful run never authorizes or applies a migration.
import { lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
import { isIPv4 } from 'node:net';
import { pathToFileURL } from 'node:url';

export const target = Object.freeze({
  host: 'saganexus2.api.openvpn.com',
  network: '1978969b-fe2b-4487-83e5-20d899bb7020',
  connector: '761644d1-288e-4d5c-893f-b76172ba861b',
  service: '9030cd59-e9e3-4548-8e5b-a5f1c835861d',
  group: 'a453bbba-a31a-4e91-b967-647b5eea6b78',
  backendHost: '517304bb-5c11-42db-a330-5eaf6047f5d5',
  backendConnector: 'e7c862fa-aea3-48a2-abbf-1f375b73388c',
});

function requireCheck(condition, code) {
  if (!condition) throw new Error(code);
}

export function readPrivate(file) {
  const stat = lstatSync(file);
  requireCheck(stat.isFile() && !stat.isSymbolicLink() && stat.uid === process.getuid()
    && (stat.mode & 0o077) === 0 && stat.size <= 128 * 1024, 'private_backup_required');
  return readFileSync(file, 'utf8');
}

export function validateEnvironments(current, prepared) {
  const url = new URL(prepared.CLOUDCONNEXA_BASE_URL);
  requireCheck(url.protocol === 'https:' && url.hostname === target.host && !url.username
    && !url.password && !url.port && !url.search && !url.hash && url.pathname === '/', 'wrong_target_account');
  requireCheck(prepared.VPN_PROVIDER === 'cloudconnexa' && prepared.CLOUDCONNEXA_CLIENT_ID
    && prepared.CLOUDCONNEXA_CLIENT_SECRET && prepared.CLOUDCONNEXA_ACCESS_GROUP_ID === target.group,
  'prepared_credentials_incomplete');
  for (const key of new Set([...Object.keys(current), ...Object.keys(prepared)])) {
    if (key !== 'VPN_PROVIDER' && !key.startsWith('CLOUDCONNEXA_')) {
      requireCheck(current[key] === prepared[key], 'unrelated_env_change');
    }
  }
}

export function validateGateway(rows, binding) {
  requireCheck(rows.length === 1, 'gateway_name_not_unique');
  const gateway = rows[0];
  const old = Array.isArray(binding) && binding.length === 1 ? binding[0] : binding;
  requireCheck(old && String(old.id ?? old.gatewayId) === String(gateway.id), 'backup_gateway_mismatch');
  function snapshot(value) {
    function field(snake, camel) {
      requireCheck(Object.hasOwn(value, snake) || Object.hasOwn(value, camel), 'backup_gateway_mismatch');
      if (Object.hasOwn(value, snake) && Object.hasOwn(value, camel)) {
        requireCheck(JSON.stringify(value[snake]) === JSON.stringify(value[camel]), 'backup_gateway_mismatch');
      }
      return Object.hasOwn(value, snake) ? value[snake] : value[camel];
    }
    let resources = field('vpn_resources', 'vpnResources');
    if (typeof resources === 'string') resources = JSON.parse(resources);
    requireCheck(resources === null || (typeof resources === 'object' && !Array.isArray(resources)), 'gateway_binding_missing');
    const legacy = [field('cc_network_id', 'ccNetworkId'), field('cc_connector_id', 'ccConnectorId'), field('cc_ip_service_id', 'ccIpServiceId')];
    requireCheck(legacy.every((item) => item === null || (typeof item === 'string' && item.length)), 'gateway_binding_missing');
    const resourceIds = resources === null ? null : ['networkId', 'connectorId', 'routeId'].map((key) => resources[key]);
    requireCheck(resourceIds === null || resourceIds.every((item) => typeof item === 'string' && item.length), 'gateway_binding_missing');
    requireCheck(resourceIds !== null || legacy.every((item) => typeof item === 'string' && item.length), 'gateway_binding_missing');
    return { name: value.name, provider: field('vpn_provider', 'vpnProvider'),
      ip: field('management_ip_address', 'managementIpAddress'), resourceIds, legacy };
  }
  const current = snapshot(gateway);
  requireCheck(JSON.stringify(current) === JSON.stringify(snapshot(old)), 'backup_gateway_mismatch');
  requireCheck(current.name === 'Teste' && current.provider === 'cloudconnexa'
    && isIPv4(current.ip), 'gateway_identity_invalid');
  return { id: gateway.id, ip: current.ip, networkId: (current.resourceIds ?? current.legacy)[0] };
}

export async function inspectTarget(prepared, gateway, request = fetch) {
  const base = `https://${target.host}`;
  async function json(path, init = {}) {
    const response = await request(base + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
    requireCheck(response.ok, path.endsWith('/token') ? `oauth_http_${response.status}` : `resource_http_${response.status}`);
    return response.json();
  }
  const token = await json('/api/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${prepared.CLOUDCONNEXA_CLIENT_ID}:${prepared.CLOUDCONNEXA_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  requireCheck(typeof token.access_token === 'string' && token.access_token, 'oauth_token_missing');
  const headers = { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' };
  const network = await json(`/api/v1/networks/${target.network}`, { headers });
  requireCheck(network.id === target.network && network.connectors?.some((item) => item.id === target.connector), 'target_network_mismatch');
  const host = await json(`/api/v1/hosts/${target.backendHost}`, { headers });
  requireCheck(host.id === target.backendHost && host.connectors?.some((item) => item.id === target.backendConnector), 'target_backend_mismatch');
  const service = await json(`/api/v1/networks/ip-services/${target.service}`, { headers });
  requireCheck(service.id === target.service, 'target_service_mismatch');
  requireCheck(service.networkId === target.network, 'target_service_network_mismatch');
  const routes = Array.isArray(service.routes) ? service.routes : [service.routes];
  requireCheck(routes.includes(`${gateway.ip}/32`), 'target_service_ip_mismatch');
  const group = await json(`/api/v1/access-groups/${target.group}`, { headers });
  requireCheck(group.id === target.group, 'target_group_mismatch');
  return { oauth: 'ok', targetResources: 'found', targetHost: target.host,
    gatewayId: gateway.id, managementIp: gateway.ip,
    bindingAlreadyTargetsNewNetwork: gateway.networkId === target.network,
    migrationApplied: false, applyAllowed: false,
    pending: ['verify_ssh_access_policy', 'verify_profile_identity', 'coordinate_backend_and_gateway_vpn', 'prepare_atomic_binding_update_and_rollback'] };
}

export async function applyMigration(backupDirectory, runtimeDirectory = '/opt/saganexus/current', gatewayId = 25) {
  requireCheck(process.getuid() === 0, 'run_as_root');
  requireCheck(backupDirectory && resolve(backupDirectory).startsWith('/var/backups/saganexus/'), 'backup_directory_required');
  const current = parseEnv(readFileSync(join(runtimeDirectory, '.env'), 'utf8'));
  requireCheck(current.CLOUDCONNEXA_BASE_URL === `https://${target.host}`, 'wrong_target_account');
  requireCheck(current.DB_CONNECTION === 'pg', 'postgres_required');
  const require = createRequire(join(runtimeDirectory, 'package.json'));
  const { Client } = require('pg');
  const client = new Client({ host: current.DB_HOST, port: Number(current.DB_PORT), user: current.DB_USER,
    password: current.DB_PASSWORD, database: current.DB_DATABASE, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT id,name,management_ip_address,vpn_provider,vpn_resources,cc_network_id,cc_connector_id,cc_ip_service_id FROM gateways WHERE id=$1 FOR UPDATE', [gatewayId]);
    requireCheck(result.rows.length === 1 && result.rows[0].name === 'Teste', 'gateway_identity_invalid');
    const row = result.rows[0];
    const resources = { networkId: target.network, connectorId: target.connector, routeId: target.service };
    await client.query('UPDATE gateways SET vpn_resources=$1::jsonb, cc_network_id=$2, cc_connector_id=$3, cc_ip_service_id=$4, updated_at=NOW() WHERE id=$5', [JSON.stringify(resources), target.network, target.connector, target.service, gatewayId]);
    await client.query('COMMIT');
    return { migrationApplied: true, applyAllowed: true, gatewayId, resources };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await client.end(); }
}

export async function main(backupDirectory, runtimeDirectory = '/opt/saganexus/current', options = {}) {
  requireCheck(process.getuid() === 0, 'run_as_root');
  requireCheck(backupDirectory && resolve(backupDirectory).startsWith('/var/backups/saganexus/'), 'backup_directory_required');
  const files = Object.fromEntries(['old.env', 'new.env', 'old-binding.json', 'old-backend.conf', 'new-backend.conf', 'metadata.json']
    .map((name) => [name, readPrivate(join(backupDirectory, name))]));
  JSON.parse(files['metadata.json']);
  const current = parseEnv(readFileSync(join(runtimeDirectory, '.env'), 'utf8'));
  const prepared = parseEnv(files['new.env']);
  validateEnvironments(current, prepared);
  requireCheck(current.DB_CONNECTION === 'pg', 'postgres_required');
  const require = createRequire(join(runtimeDirectory, 'package.json'));
  const { Client } = require('pg');
  const client = new Client({ host: current.DB_HOST, port: Number(current.DB_PORT), user: current.DB_USER,
    password: current.DB_PASSWORD, database: current.DB_DATABASE, connectionTimeoutMillis: 5000,
    statement_timeout: 5000, options: '-c default_transaction_read_only=on' });
  let gateway;
  try {
    await client.connect();
    const result = await client.query('SELECT id, name, management_ip_address, vpn_provider, vpn_resources, cc_network_id, cc_connector_id, cc_ip_service_id FROM gateways WHERE name = $1', ['Teste']);
    gateway = validateGateway(result.rows, JSON.parse(files['old-binding.json']));
  } finally { await client.end(); }
  const result = await inspectTarget(prepared, gateway);
  return options.apply ? await applyMigration(backupDirectory, runtimeDirectory, options.gatewayId ?? 25) : result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const apply = process.argv.includes('--apply');
    const gatewayArg = process.argv.find((arg) => arg.startsWith('--gateway-id='));
    console.log(JSON.stringify(await main(process.argv[2], process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '/opt/saganexus/current', { apply, gatewayId: gatewayArg ? Number(gatewayArg.split('=')[1]) : 25 })));
  }
  catch (error) {
    // Never print raw transport/DB errors: they may contain credentials or response bodies.
    const code = /^(?:private_backup_required|wrong_target_account|prepared_credentials_incomplete|unrelated_env_change|gateway_name_not_unique|backup_gateway_mismatch|gateway_identity_invalid|gateway_binding_missing|oauth_http_\d+|resource_http_\d+|oauth_token_missing|target_\w+_mismatch|run_as_root|backup_directory_required|postgres_required)$/.test(error?.message)
      ? error.message : 'preflight_failed_review_locally';
    console.log(JSON.stringify({ error: code, migrationApplied: false, applyAllowed: false }));
    process.exitCode = 1;
  }
}
