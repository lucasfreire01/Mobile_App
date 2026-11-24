import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';

test('rediscovers the same gateway after cable loss and reuses released ports safely', async (t) => {
  const oldArgv = process.argv;
  process.argv = ['node', 'fixture', '192.0.2.1', '198.51.100.1'];
  t.after(() => { process.argv = oldArgv; t.mock.restoreAll(); syncBuiltinESMExports(); });
  let currentInterfaces = {
    WiFi: [{ address: '198.51.100.1', netmask: '255.255.255.0', family: 'IPv4', internal: false }],
    Ethernet: [{ address: '203.0.113.1', netmask: '255.255.255.128', family: 'IPv4', internal: false }],
  };
  t.mock.method(os, 'networkInterfaces', () => currentInterfaces);
  syncBuiltinESMExports();
  let online = new Set(['203.0.113.10', '203.0.113.20']);
  let handler;
  const ports = new Set();
  t.mock.method(globalThis, 'setInterval', () => 0);
  t.mock.method(http, 'createServer', (callback) => {
    handler = callback;
    return { listen() {} };
  });
  t.mock.method(https, 'get', (options, callback) => {
    const request = new EventEmitter();
    queueMicrotask(() => {
      if (!online.has(options.hostname)) { request.emit('error', new Error('cable disconnected')); return; }
      const response = new EventEmitter();
      response.statusCode = 200;
      callback(response);
      response.emit('data', JSON.stringify({ model: 'Fixture', mac: `00:16:16:00:00:${Number(options.hostname.split('.').at(-1)).toString(16).padStart(2, '0')}` }));
      response.emit('end');
    });
    return request;
  });
  t.mock.method(net, 'createServer', () => {
    const server = new EventEmitter();
    let assigned;
    server.listen = (port, _host, callback) => {
      queueMicrotask(() => {
        if (ports.has(port)) { server.emit('error', new Error('EADDRINUSE')); return; }
        ports.add(port);
        assigned = port;
        callback();
      });
    };
    server.close = () => ports.delete(assigned);
    return server;
  });
  const { scan } = await import('../gateway_lan_bridge.ts');
  function discovery() {
    let result;
    handler({ method: 'GET', url: '/saganexus-discovery', socket: { remoteAddress: '192.0.2.2' } }, {
      setHeader() {}, end(body) { result = JSON.parse(body); },
    });
    return result.gateways;
  }
  assert.equal(discovery().length, 2, 'parallel discovery must allocate distinct ports');
  assert.equal(ports.size, 2);

  currentInterfaces = {
    WiFi: [{ address: '198.51.100.1', netmask: '255.255.255.0', family: 'IPv4', internal: false }],
    Ethernet: [{ address: '192.0.2.129', netmask: '255.255.255.128', family: 'IPv4', internal: false }],
  };
  online = new Set(['192.0.2.130']);
  await scan();
  assert.deepEqual(discovery().map(({ ip }) => ip), ['192.0.2.130'], 'scan must rebuild networks after DHCP/interface changes');

  currentInterfaces = {
    WiFi: [{ address: '198.51.100.1', netmask: '255.255.255.0', family: 'IPv4', internal: false }],
    Ethernet: [{ address: '203.0.113.1', netmask: '255.255.255.128', family: 'IPv4', internal: false }],
  };
  online = new Set(['203.0.113.20']);
  await scan();
  assert.equal(discovery().length, 1);
  assert.equal(ports.size, 1, 'disconnect must release the old tunnel');

  online.add('203.0.113.30');
  await scan();
  assert.equal(discovery().length, 2, 'a new device must reuse the free port without colliding with an existing tunnel');
  assert.equal(ports.size, 2);

  online = new Set();
  await scan();
  assert.deepEqual(discovery(), []);
  assert.equal(ports.size, 0);

  for (let reconnect = 0; reconnect < 3; reconnect++) {
    online.add('203.0.113.10');
    await scan();
    assert.equal(discovery().length, 1, 'the same IP must be listed again after reconnect');
    online.clear();
    await scan();
    assert.equal(ports.size, 0);
  }
});
