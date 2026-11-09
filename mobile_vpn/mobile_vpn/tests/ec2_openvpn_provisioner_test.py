"""Unprivileged helper tests: no real certificates, routes or server changes."""
import importlib.util
import ipaddress
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'provisioner', Path(__file__).resolve().parents[1] / 'scripts/ec2_openvpn_provisioner.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class ProvisionerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        for key, value in {'STATE': root, 'PKI': root / 'pki',
                           'CCD': root / 'ccd', 'SERVER': root / 'server',
                           'CRL': root / 'crl.pem'}.items():
            patcher = patch.object(helper, key, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        for folder in (helper.PKI / 'issued', helper.PKI / 'private', helper.CCD, helper.SERVER):
            folder.mkdir(parents=True, exist_ok=True)
        self.config = {'subnet': ipaddress.IPv4Network('10.8.0.0/24'),
                       'server_ip': '10.8.0.1', 'interface': 'tun0',
                       'endpoint': 'vpn.example.com', 'port': 1194,
                       'allowlist': [ipaddress.IPv4Network('192.168.0.0/16')]}

    def issue(self, args, **kwargs):
        identifier = args[2]
        (helper.PKI / 'issued' / (identifier + '.crt')).write_text('CERT')
        (helper.PKI / 'private' / (identifier + '.key')).write_text('PRIVATE KEY')

    def gateway(self, ip='10.8.0.2'):
        with patch.object(helper, 'run', side_effect=self.issue):
            return helper.create({'name': 'Gateway', 'managementIp': ip}, self.config)

    def test_creation_retry_preserves_identity_and_certificate(self):
        first = self.gateway()
        with patch.object(helper, 'run') as command:
            second = helper.create({'name': 'Gateway', 'managementIp': '10.8.0.2'}, self.config)
        self.assertEqual(first, second)
        command.assert_not_called()
        self.assertIn('ifconfig-push 10.8.0.2 255.255.255.0',
                      (helper.CCD / first['networkId']).read_text())

    def test_cannot_assign_server_or_external_address(self):
        for ip in ('10.8.0.1', '10.8.0.0', '10.8.0.255', '172.31.46.196'):
            with self.subTest(ip=ip), self.assertRaises(ValueError), patch.object(helper, 'run') as command:
                helper.create({'name': 'Gateway', 'managementIp': ip}, self.config)
            command.assert_not_called()

    def test_routes_outside_allowlist_never_touch_kernel(self):
        gateway = self.gateway()
        for route in ('0.0.0.0/0', '172.31.0.0/16', '10.8.0.0/24'):
            with self.subTest(route=route), patch.object(helper.subprocess, 'run') as command:
                with self.assertRaises(ValueError):
                    helper.routes({'routeId': gateway['routeId'], 'routes': [route]}, self.config)
                command.assert_not_called()

    def test_overlapping_routes_cannot_be_taken_from_another_gateway(self):
        first, second = self.gateway(), self.gateway('10.8.0.3')
        record = helper.load(first['networkId'])
        record['routes'] = ['192.168.1.0/24']
        helper.save(record)
        with patch.object(helper.subprocess, 'run') as command, self.assertRaises(ValueError):
            helper.routes({'routeId': second['routeId'], 'routes': ['192.168.1.0/25']}, self.config)
        command.assert_not_called()

    def test_path_traversal_rejected(self):
        with self.assertRaises(ValueError):
            helper.profile({'connectorId': '../../etc/shadow'}, self.config)

    def test_delete_does_not_release_identity_if_disconnect_fails(self):
        identifier = self.gateway()['networkId']
        (helper.PKI / 'index.txt').write_text('R\tdate\tdate\tserial\tunknown\t/CN=' + identifier + '\n')
        (helper.PKI / 'crl.pem').write_text('CRL')
        with patch.object(helper, 'run'), patch.object(helper, 'disconnect', side_effect=OSError):
            with self.assertRaises(OSError):
                helper.delete({'networkId': identifier}, self.config)
        self.assertEqual(__import__('json').loads(helper.record_path(identifier).read_text())['status'], 'deleting')
        self.assertTrue((helper.CCD / identifier).exists())


if __name__ == '__main__':
    unittest.main()
