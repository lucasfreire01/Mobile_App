#!/usr/bin/python3
"""Root-owned OpenVPN helper. JSON stdin/stdout; never emit subprocess output.

Install behind a sudo wrapper allowing only this executable, with no arguments.
Server setup must create the PKI, CRL, tls-crypt key, CCD directory and tun device.
Configuration: /etc/saganexus/openvpn.json, root-owned, not group/world writable:
{"endpoint":"vpn.example.com", "port":1194, "network":"10.8.0.0/24",
 "server_ip":"10.8.0.1", "interface":"tun0",
 "allowed_routes":["192.168.0.0/16"]}
OpenVPN must use topology subnet, client-config-dir CCD and crl-verify CRL below.
Route changes take effect for clients on reconnect; kernel routes update immediately.
"""

import contextlib
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import tempfile
import uuid


CONFIG = Path('/etc/saganexus/openvpn.json')
STATE = Path('/var/lib/saganexus-openvpn')
PKI = STATE / 'pki'
SERVER = Path('/etc/openvpn/server/saganexus')
CCD = SERVER / 'ccd'
CRL = SERVER / 'crl.pem'
EASYRSA = '/usr/share/easy-rsa/easyrsa'
IP = '/usr/sbin/ip'
MANAGEMENT = '/run/openvpn-server/saganexus.sock'
ID = re.compile(r'snx_[a-f0-9]{24}\Z')
SAFE_ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'}


def require(condition):
    if not condition:
        raise ValueError('Invalid request or server configuration')


def atomic_write(path, content, mode=0o600):
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            os.fchmod(stream.fileno(), mode)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def run(arguments, *, pki=False):
    environment = dict(SAFE_ENV)
    if pki:
        environment.update(EASYRSA_BATCH='1', EASYRSA_PKI=str(PKI))
    subprocess.run(arguments, check=True, capture_output=True, timeout=20,
                   env=environment, cwd=STATE)


def configuration():
    metadata = CONFIG.lstat()
    require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 0
            and not metadata.st_mode & 0o022)
    config = json.loads(CONFIG.read_text())
    require(isinstance(config, dict))
    require(isinstance(config.get('endpoint'), str)
            and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{0,252}', config['endpoint']))
    require(type(config.get('port')) is int and 1 <= config['port'] <= 65535)
    require(re.fullmatch(r'[A-Za-z0-9_-]{1,15}', config.get('interface', '')))
    network = ipaddress.IPv4Network(config['network'])
    server = ipaddress.IPv4Address(config['server_ip'])
    require(server in network and server not in (network.network_address, network.broadcast_address))
    require(isinstance(config.get('allowed_routes'), list))
    config['allowlist'] = [ipaddress.IPv4Network(route) for route in config['allowed_routes']]
    require(all(route.is_private and not route.overlaps(network) for route in config['allowlist']))
    config['subnet'] = network
    return config


def resource_id(value):
    require(isinstance(value, str) and ID.fullmatch(value))
    return value


def record_path(identifier):
    return STATE / (resource_id(identifier) + '.json')


def save(record):
    atomic_write(record_path(record['id']), json.dumps(record))


def ccd_content(record, config):
    lines = [f"ifconfig-push {record['managementIp']} {config['subnet'].netmask}"]
    for route in record['routes']:
        subnet = ipaddress.IPv4Network(route)
        lines.append(f'iroute {subnet.network_address} {subnet.netmask}')
    return '\n'.join(lines) + '\n'


def load(identifier):
    record = json.loads(record_path(identifier).read_text())
    require(record['id'] == identifier and record['status'] == 'ready')
    return record


def create(request, config):
    name = request.get('name')
    require(isinstance(name, str) and 0 < len(name.strip()) <= 255)
    address = ipaddress.IPv4Address(request['managementIp'])
    network = config['subnet']
    require(address in network and address not in (
        network.network_address, network.broadcast_address,
        ipaddress.IPv4Address(config['server_ip'])))
    # Stable identity allows a retry after timeout without issuing a second identity.
    identifier = 'snx_' + hashlib.sha256(str(address).encode()).hexdigest()[:24]
    records = [json.loads(path.read_text()) for path in STATE.glob('snx_*.json')]
    active = [entry for entry in records if entry['managementIp'] == str(address)
              and entry['status'] != 'deleted']
    require(len(active) <= 1)
    if active:
        identifier = resource_id(active[0]['id'])
    elif record_path(identifier).exists():
        identifier = 'snx_' + uuid.uuid4().hex[:24]
    path = record_path(identifier)
    if path.exists():
        record = json.loads(path.read_text())
        require(record['status'] in ('creating', 'ready'))
    else:
        record = {'id': identifier, 'managementIp': str(address),
                  'routes': [], 'status': 'creating'}
        save(record)
    if record['status'] != 'ready':
        if not (PKI / 'issued' / (identifier + '.crt')).exists():
            run([EASYRSA, 'build-client-full', identifier, 'nopass'], pki=True)
        require((PKI / 'private' / (identifier + '.key')).is_file())
        atomic_write(CCD / identifier, ccd_content(record, config), 0o644)
        record['status'] = 'ready'
        save(record)
    return dict(networkId=identifier, connectorId=identifier, routeId=identifier)


def profile(request, config):
    identifier = resource_id(request.get('connectorId'))
    load(identifier)
    pieces = ['client', 'dev tun', 'proto udp',
              f"remote {config['endpoint']} {config['port']}",
              'resolv-retry infinite', 'nobind', 'persist-key', 'persist-tun',
              'remote-cert-tls server', 'verify-x509-name saganexus-server name',
              'auth-nocache', 'verb 3']
    for tag, path in [('ca', PKI / 'ca.crt'),
                      ('cert', PKI / 'issued' / (identifier + '.crt')),
                      ('key', PKI / 'private' / (identifier + '.key')),
                      ('tls-crypt', SERVER / 'tls-crypt.key')]:
        pieces.extend([f'<{tag}>', path.read_text().strip(), f'</{tag}>'])
    return {'format': 'openvpn', 'content': '\n'.join(pieces) + '\n'}


def routes(request, config):
    identifier = resource_id(request.get('routeId'))
    record = load(identifier)
    requested = request.get('routes')
    require(isinstance(requested, list) and len(requested) <= 256)
    networks = [ipaddress.IPv4Network(route) for route in requested]
    require(len(set(networks)) == len(networks))
    for network in networks:
        require(not network.overlaps(config['subnet'])
                and any(network.subnet_of(allowed) for allowed in config['allowlist']))
    for path in STATE.glob('snx_*.json'):
        other = json.loads(path.read_text())
        if other['id'] != identifier and other['status'] != 'deleted':
            require(not any(network.overlaps(ipaddress.IPv4Network(route))
                            for network in networks for route in other['routes']))
    # Journal both sets before mutations so a partial failure still reserves routes.
    previous = set(record['routes'])
    desired = {str(network) for network in networks}
    record['routes'] = sorted(previous | desired)
    save(record)
    for route in sorted(desired):
        # Do not replace an unrelated host/VPC route.
        existing = subprocess.run([IP, '-j', 'route', 'show', 'exact', route],
                                  check=True, capture_output=True, timeout=5, env=SAFE_ENV)
        found = json.loads(existing.stdout)
        require(all(item.get('dev') == config['interface'] for item in found))
        run([IP, 'route', 'replace', route, 'dev', config['interface']])
    for route in sorted(previous - desired):
        run([IP, 'route', 'del', route, 'dev', config['interface']])
    record['routes'] = sorted(desired)
    atomic_write(CCD / identifier, ccd_content(record, config), 0o644)
    save(record)
    return {'updated': True}


def delete(request, config):
    identifier = resource_id(request.get('networkId'))
    path = record_path(identifier)
    if not path.exists():
        return {'deleted': True}
    record = json.loads(path.read_text())
    if record['status'] == 'deleted':
        return {'deleted': True}
    # Keep the record and IP reserved until revocation AND disconnection succeed.
    record['status'] = 'deleting'
    save(record)
    revoked = any(line.startswith('R\t') and line.rstrip().endswith('/CN=' + identifier)
                  for line in (PKI / 'index.txt').read_text().splitlines())
    if not revoked:
        run([EASYRSA, 'revoke', identifier], pki=True)
    run([EASYRSA, 'gen-crl'], pki=True)
    atomic_write(CRL, (PKI / 'crl.pem').read_text(), 0o644)
    disconnect(identifier)
    for route in record['routes']:
        result = subprocess.run([IP, '-j', 'route', 'show', 'exact', route],
                                check=True, capture_output=True, timeout=5, env=SAFE_ENV)
        if any(item.get('dev') == config['interface'] for item in json.loads(result.stdout)):
            run([IP, 'route', 'del', route, 'dev', config['interface']])
    with contextlib.suppress(FileNotFoundError):
        (CCD / identifier).unlink()
    record['status'] = 'deleted'
    save(record)
    return {'deleted': True}


def disconnect(identifier):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(3)
        connection.connect(MANAGEMENT)
        with connection.makefile('rb') as stream:
            require(stream.readline(4096).startswith(b'>INFO:'))
            connection.sendall(('kill ' + identifier + '\n').encode())
            for _ in range(32):
                line = stream.readline(4096).decode('utf-8')
                if line.startswith('SUCCESS:'):
                    return
                if line.startswith('ERROR:'):
                    require('not found' in line and identifier in line)
                    return
                require(bool(line))
    raise ValueError('Client disconnection not confirmed')


def main():
    require(os.geteuid() == 0)
    if sys.argv[1:] == ['--renew-crl']:
        with (STATE / 'provisioner.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            run([EASYRSA, 'gen-crl'], pki=True)
            atomic_write(CRL, (PKI / 'crl.pem').read_text(), 0o644)
        return
    require(len(sys.argv) == 1)
    data = sys.stdin.buffer.read(1024 * 1024 + 1)
    require(len(data) <= 1024 * 1024)
    request = json.loads(data)
    require(isinstance(request, dict) and type(request.get('version')) is int
            and request['version'] == 1)
    actions = {'createGateway': create, 'getProfile': profile,
               'updateRoutes': routes, 'deleteGateway': delete}
    require(request.get('action') in actions)
    config = configuration()
    require(STATE.is_dir() and CCD.is_dir() and PKI.is_dir())
    with (STATE / 'provisioner.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        response = actions[request['action']](request, config)
    print(json.dumps(response))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('OpenVPN operation failed; inspect server configuration.', file=sys.stderr)
        sys.exit(1)
