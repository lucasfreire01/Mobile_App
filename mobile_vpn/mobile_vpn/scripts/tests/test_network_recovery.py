import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'gateway_network_recovery.sh'


class NetworkRecoveryTests(unittest.TestCase):
    def run_recovery(self, carrier='1', command=b'udhcpc\0-p\0/var/run/udhcpc.eth0.pid\0'):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for folder in ('sys/class/net/eth0', 'var/run', 'proc/123'):
                (root/folder).mkdir(parents=True)
            (root/'sys/class/net/eth0/carrier').write_text(carrier)
            (root/'var/run/udhcpc.eth0.pid').write_text('123')
            (root/'proc/123/cmdline').write_bytes(command)
            source = SCRIPT.read_text()
            for prefix in ('/sys/', '/var/', '/proc/'):
                source = source.replace(prefix, str(root)+prefix)
            source = source.replace('set -eu', 'set -eu\nkill() { printf "%s %s" "$1" "$2" > "$SIGNAL_RESULT"; }')
            result = subprocess.run(['sh'], input=source, text=True, capture_output=True,
                                    env={**os.environ, 'SIGNAL_RESULT': str(root/'signal')}, timeout=3)
            self.assertEqual(result.returncode, 0, result.stderr)
            return (root/'signal').read_text() if (root/'signal').exists() else None

    def test_connected_dhcp_client_receives_renew_signal(self):
        self.assertEqual(self.run_recovery(), '-USR1 123')

    def test_disconnected_cable_does_not_signal(self):
        self.assertIsNone(self.run_recovery(carrier='0'))

    def test_reused_pid_of_another_process_is_ignored(self):
        self.assertIsNone(self.run_recovery(command=b'other-process\0'))


if __name__ == '__main__':
    unittest.main()
