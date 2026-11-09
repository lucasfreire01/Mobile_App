#!/usr/bin/python3
"""Deploy an already-built backend; credentials stay on the EC2 host."""
import grp
import os
from pathlib import Path
import re
import shutil
import subprocess


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run as root on the EC2 host.')
    source = Path('/home/ubuntu/Mobile_App/mobile_vpn')
    release = Path('/opt/saganexus/releases/20261104-ec2-vpn')
    if release.exists():
        raise SystemExit('Release already exists; inspect before replacing.')
    if not (source / 'build/bin/server.js').is_file():
        raise SystemExit('Build is missing.')
    shutil.copytree(source / 'build', release, symlinks=True)
    # Never copy the database administrator file into the runtime release.
    environment = (source / '.env').read_text()
    values = {
        'NODE_ENV': 'production', 'HOST': '127.0.0.1', 'PORT': '3333',
        'APP_URL': 'https://13-59-146-35.sslip.io',
        'VPN_PROVIDER': 'ec2_openvpn',
        'EC2_OPENVPN_PROVISIONER': '/usr/local/bin/saganexus-openvpn',
        'GATEWAY_MGMT_IP_PREFIX': '10.200.0',
        'GATEWAY_SSH_ALLOWED_CIDRS': '10.200.0.0/24',
        'BROWAN_SSH_KEY_PATH': '/etc/saganexus/keys/gateway',
        'BROWAN_SSH_USERNAME': 'root', 'BROWAN_SSH_PORT': '22',
    }
    for key, value in values.items():
        pattern = rf'^{key}=.*$'
        if re.search(pattern, environment, re.M):
            environment = re.sub(pattern, lambda _: f'{key}={value}', environment, flags=re.M)
        else:
            environment += f'\n{key}={value}\n'
    app_env = release / '.env'
    # Create privately from the start, then allow only the runtime group to read.
    fd = os.open(app_env, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(environment)
    os.chown(app_env, 0, grp.getgrnam('saganexus').gr_gid)
    app_env.chmod(0o640)
    current = Path('/opt/saganexus/current')
    if current.exists() or current.is_symlink():
        raise SystemExit('Current release already exists; inspect before switching.')
    current.symlink_to(release, target_is_directory=True)
    commands = {
        'saganexus-api': '/usr/local/bin/node bin/server.js',
        'saganexus-network-worker': '/usr/local/bin/node ace.js gateway:network-worker',
    }
    for name, command in commands.items():
        unit = f'''[Unit]
Description={name}
After=network-online.target postgresql.service openvpn-server@saganexus.service
Wants=network-online.target openvpn-server@saganexus.service
[Service]
Type=simple
User=saganexus
Group=saganexus
WorkingDirectory=/opt/saganexus/current
Environment=NODE_ENV=production
ExecStart={command}
Restart=on-failure
RestartSec=5
UMask=0077
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
RestrictRealtime=true
# The restricted sudo helper needs privilege elevation for OpenVPN operations.
ReadWritePaths=/var/lib/saganexus-openvpn /etc/openvpn/server/saganexus
[Install]
WantedBy=multi-user.target
'''
        Path('/etc/systemd/system/' + name + '.service').write_text(unit)
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'enable', '--now',
                    'saganexus-api.service', 'saganexus-network-worker.service'], check=True)
    print('Backend services installed; original .env and administrator credentials preserved.')


if __name__ == '__main__':
    main()
