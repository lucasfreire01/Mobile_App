import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Render the actual components with native primitives and navigation replaced.
// This verifies their wiring; native gestures still require an Android/iOS run.
function fixture(status = 'waiting', canGoBack = true) {
  const actions = [];
  const prevention = [];
  let stateIndex = 0;
  const element = (type, props) => ({ type, props: props ?? {} });
  const router = {
    canGoBack: () => canGoBack,
    back: () => actions.push('back'),
    replace: (path) => actions.push(path),
  };
  const modules = {
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    react: {
      useState: (initial) => {
        const index = stateIndex++;
        return [index === 6 ? 'test-code' : initial === 'waiting' ? status : initial, () => {}];
      },
      useRef: (current) => ({ current }),
      useEffect: () => {},
      useCallback: (callback) => callback,
    },
    'react-native': Object.fromEntries(['View', 'Text', 'Pressable', 'ScrollView', 'KeyboardAvoidingView'].map((key) => [key, key])),
    'expo-router': { router, usePreventRemove: (value) => prevention.push(value) },
    'expo-network': {},
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    './brand': { Brand: 'Brand' },
    '../../components/form-field': { FormField: 'FormField' },
    '../../auth/auth-context': { useAuth: () => ({ apiFetch: async () => {} }) },
    '../../config/api': { getApiUrl: () => 'https://backend.example' },
    '../../lib/api-error': { getApiErrorMessage: () => '' },
    '../../lib/gateway-discovery': {},
    '../../lib/gateway-pairing': {},
    '../../lib/gateway-pairing-layout': { getGatewayPairingLayout: () => ({ showDevicePicker: true, showPairingCode: true, showGatewayForm: false }) },
  };
  modules['react-native'].Platform = { OS: 'android' };
  function load(path) {
    const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, { exports, require: (name) => {
      assert.ok(name in modules, `missing mock: ${name}`);
      return modules[name];
    } });
    return exports;
  }
  const { ScreenHeader } = load('../src/components/screen-header.tsx');
  modules['../../components/screen-header'] = { ScreenHeader };
  const { default: Screen } = load('../src/app/gateways/new.tsx');
  return { Screen, ScreenHeader, actions, prevention };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  return [node.props?.children].flat(Infinity).map((child) => find(child, predicate)).find(Boolean);
}

test('back is disabled and navigation removal prevented only while pairing', () => {
  for (const status of ['waiting', 'pairing', 'paired', 'pending', 'error']) {
    const f = fixture(status);
    const tree = f.Screen();
    assert.deepEqual(f.prevention, [status === 'pairing']);
    const header = find(tree, (node) => node.type === f.ScreenHeader);
    const back = find(f.ScreenHeader(header.props), (node) => node.props.accessibilityLabel === 'Voltar');
    assert.equal(back.props.disabled, status === 'pairing');
    assert.equal(back.props.accessibilityState.disabled, status === 'pairing');
    back.props.onPress();
    assert.deepEqual(f.actions, status === 'pairing' ? [] : [status === 'waiting' ? 'back' : '/gateways']);
    const finished = status === 'paired' || status === 'pending' || status === 'error';
    const exit = find(tree, (node) => node.props.accessibilityLabel === 'Voltar aos gateways');
    assert.equal(Boolean(exit), finished);
    if (finished) { exit.props.onPress(); assert.equal(f.actions.at(-1), '/gateways'); }
  }
});

test('pending confirmation is neutral, prevents duplicate pairing and allows leaving', () => {
  const f = fixture('pending');
  const tree = f.Screen();
  assert.ok(find(tree, (node) => node.type === 'Text' && node.props.children === 'Aguardando confirmação online'));
  assert.equal(find(tree, (node) => node.props.accessibilityRole === 'alert'), undefined);
  const receipt = find(tree, (node) => node.type === 'Pressable' && node.props.children?.props?.children === 'Recebimento confirmado');
  assert.ok(receipt);
  assert.equal(receipt.props.disabled, true);
  assert.ok(find(tree, (node) => node.props.accessibilityLabel === 'Voltar aos gateways'));
});

test('header returns to gateways when there is no previous screen', () => {
  const f = fixture('waiting', false);
  const tree = f.ScreenHeader({ title: 'Gateway', subtitle: 'Teste' });
  const back = find(tree, (node) => node.props.accessibilityLabel === 'Voltar');
  back.props.onPress();
  assert.deepEqual(f.actions, ['/gateways']);
});
