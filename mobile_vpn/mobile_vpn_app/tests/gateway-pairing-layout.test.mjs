import assert from 'node:assert/strict';
import test from 'node:test';
import { getGatewayPairingLayout } from '../src/lib/gateway-pairing-layout.ts';

test('mostra seletor de PC e gateway antes de gerar o código', () => {
  assert.deepEqual(getGatewayPairingLayout(false), {
    showDevicePicker: true,
    showPairingCode: false,
    showGatewayForm: true,
  });
});

test('mantém seletor de PC e gateway visível depois de gerar o código', () => {
  assert.deepEqual(getGatewayPairingLayout(true), {
    showDevicePicker: true,
    showPairingCode: true,
    showGatewayForm: false,
  });
});
