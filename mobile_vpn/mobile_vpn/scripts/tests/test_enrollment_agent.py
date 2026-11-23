"""Run the real enrollment shell with fake firmware commands; no network/devices."""
import base64
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import unittest

AGENT = Path(__file__).resolve().parents[1] / 'gateway_enrollment_agent.sh'
MOCK = '''#!/usr/bin/env python3
import json, os, pathlib, subprocess, sys
r = pathlib.Path(os.environ['FIXTURE_ROOT'])
name = pathlib.Path(sys.argv[0]).name
a = sys.argv[1:]
if name == 'curl':
    if a[-1].endswith('/claim'): print((r/'response.json').read_text())
    else:
        (r/'completed').touch()
        sys.exit(int(os.environ.get('COMPLETE_FAIL', '0')))
elif name == 'jq':
    v = json.loads(pathlib.Path(a[-1]).read_text())
    for k in a[-2].strip('.').split('.'): v = v[k]
    print(v)
elif name == 'ssh-keygen': print('256 SHA256:' + 'A'*43 + ' fixture')
elif name == 'busybox':
    if a == ['--list']: print('base64')
    else: sys.exit(subprocess.run(['base64', '-d'], stdin=sys.stdin, stdout=sys.stdout).returncode)
elif name == 'uci':
    if 'get' in a: print((r/'enabled').read_text())
    if 'set' in a:
        value = a[-1].split('=')[1]
        (r/'enabled').write_text(value)
        with (r/'events').open('a') as f: f.write('enable='+value+'\\n')
elif name == 'ifconfig':
    if (r/'tunnel').exists(): print('inet addr:100.96.1.50')
    else: sys.exit(1)
elif name == 'S90openvpn':
    enabled = (r/'enabled').read_text()
    with (r/'events').open('a') as f: f.write('restart='+enabled+'\\n')
    (r/'tunnel').unlink(missing_ok=True)
    if enabled == '1' and not os.environ.get('VPN_FAIL'): (r/'tunnel').touch()
elif name in ('sleep', 'ip'): pass
'''


class EnrollmentAgentTests(unittest.TestCase):
    def run_agent(self, *, vpn_fail=False, complete_fail=False, valid=True):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        for d in ('bin', 'etc/saganexus', 'etc/ssh', 'etc/init.d',
                  'etc/openvpn', 'etc/crontabs', 'var/run', 'tmp'):
            (root/d).mkdir(parents=True, exist_ok=True)
        for name in ('curl', 'jq', 'ssh-keygen', 'busybox', 'uci', 'ifconfig', 'sleep', 'ip'):
            p = root/'bin'/name
            p.write_text(MOCK)
            p.chmod(0o700)
        init = root/'etc/init.d/S90openvpn'
        init.write_text(MOCK)
        init.chmod(0o700)
        (root/'enabled').write_text('0')
        (root/'etc/ssh/ssh_host_ed25519_key.pub').write_text('public fixture')
        (root/'etc/saganexus/ca-bundle.pem').write_text('fixture CA')
        (root/'etc/saganexus/enrollment.conf').write_text(
            "API_URL='https://fixture.invalid'\nENROLLMENT_CODE='" + 'A'*43 + "'\n"
            + f"CA_BUNDLE='{root}/etc/saganexus/ca-bundle.pem'\n")
        (root/'etc/openvpn/client.conf').write_text('previous profile\n')
        profile = 'remote fixture.invalid 1194 udp\n<cert>fixture</cert>\n<key>fixture</key>\n' if valid else 'invalid'
        (root/'response.json').write_text(json.dumps({
            'gateway': {'id': 24, 'managementIpAddress': '10.200.0.2'},
            'vpn': {'format': 'openvpn', 'contentBase64': base64.b64encode(profile.encode()).decode()},
        }))
        source = re.sub(r'/(?:etc/|var/run/|tmp/)', lambda m: str(root)+m.group(), AGENT.read_text())
        source = source.replace('PATH=/usr/sbin:/usr/bin:/sbin:/bin', f'PATH={root}/bin:/usr/bin:/bin')
        source = source.replace('/sbin/ip', 'ip')
        script = root/'agent.sh'
        script.write_text(source)
        env = {**os.environ, 'FIXTURE_ROOT': str(root)}
        if vpn_fail: env['VPN_FAIL'] = '1'
        if complete_fail: env['COMPLETE_FAIL'] = '1'
        result = subprocess.run(['sh', str(script)], env=env, capture_output=True, text=True, timeout=10)
        return root, result

    def test_disabled_client_is_enabled_before_start_and_enrollment_completes(self):
        root, result = self.run_agent()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((root/'events').read_text().splitlines()[:2], ['enable=1', 'restart=1'])
        self.assertTrue((root/'completed').exists())
        self.assertFalse((root/'etc/saganexus/enrollment.conf').exists())
        self.assertIn('udp4', (root/'etc/openvpn/client.conf').read_text())

    def test_invalid_profile_preserves_existing_profile_and_disabled_state(self):
        root, result = self.run_agent(valid=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((root/'etc/openvpn/client.conf').read_text(), 'previous profile\n')
        self.assertEqual((root/'enabled').read_text(), '0')
        self.assertFalse((root/'completed').exists())

    def test_failed_vpn_restores_previous_profile_and_retains_pending_enrollment(self):
        root, result = self.run_agent(vpn_fail=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((root/'etc/openvpn/client.conf').read_text(), 'previous profile\n')
        self.assertEqual((root/'enabled').read_text(), '0')
        self.assertTrue((root/'etc/saganexus/enrollment.conf').exists())
        self.assertFalse((root/'completed').exists())

    def test_failed_completion_keeps_code_for_retry(self):
        root, result = self.run_agent(complete_fail=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue((root/'etc/saganexus/enrollment.conf').exists())


if __name__ == '__main__':
    unittest.main()
