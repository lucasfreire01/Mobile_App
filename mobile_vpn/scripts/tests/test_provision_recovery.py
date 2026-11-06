from pathlib import Path
import subprocess,tempfile
s=(Path(__file__).resolve().parents[1] / 'provision_gateway.sh').read_text()
f=s[s.index('finish_provisioning() {'):s.index('# mkdir is also a lock:')]
cases=[('success',0,0,0,False),('restart_failure',1,0,1,True),('management_unreachable',0,1,1,True),('rollback_failure',1,0,1,True)]
for name,initial,ssh_failure,expected,rollback in cases:
 with tempfile.TemporaryDirectory() as d:
  log=Path(d)/'calls'
  setup='''TRANSACTION_STARTED=1
RECOVERY_DIR=/etc/openvpn/.provision-recovery
SSH_OPTS='-o BatchMode=yes'
SSH_PORT=22
SSH_USER=root
MGMT_IP=10.200.0.2
ssh() { return SSH_FAILURE; }
ssh_run() { printf '%s\\n' "$1" >> LOG_PATH; case "$1" in *'for f in'*) return ROLLBACK_FAILURE;; esac; return 0; }
'''.replace('SSH_FAILURE',str(ssh_failure)).replace('ROLLBACK_FAILURE','1' if name=='rollback_failure' else '0').replace('LOG_PATH',str(log))
  r=subprocess.run(['bash','-c',setup+f+'\ntrap finish_provisioning EXIT\nexit '+str(initial)],capture_output=True,text=True)
  calls=log.read_text() if log.exists() else ''
  assert r.returncode==expected,(name,r.returncode,r.stderr)
  assert ('for f in' in calls)==rollback,(name,calls)
  assert ('rm -rf' in calls)==(name!='rollback_failure'),(name,calls)
  print(name+': PASS')

# Exercise transport selection and conversion with no credentials or network.
functions=s[s.index('detect_vpn_ip_family() {'):s.index('VPN_IP_FAMILY=$(select_vpn_ip_family)')]
profile="remote example.test 1194 udp4\nremote example.test 443 tcp6\nproto tcp-client\n<key>\nprivate-placeholder\n</key>\n"
for family in ['4','6','dual']:
    suffix='' if family=='dual' else family
    expected=f"remote example.test 1194 udp{suffix}\nremote example.test 443 tcp{suffix}\nproto tcp{suffix}-client\n<key>\nprivate-placeholder\n</key>\n"
    cmd=functions+f'\nrewrite_vpn_ip_family {family}'
    result=subprocess.run(['bash','-c',cmd],input=profile,capture_output=True,text=True,check=True)
    assert result.stdout==expected,(family,result.stdout)
    twice=subprocess.run(['bash','-c',cmd],input=result.stdout,capture_output=True,text=True,check=True)
    assert twice.stdout==expected
    print(f'family {family} conversion/idempotence: PASS')
for mode,legacy,detected,expected in [('auto','0','4','4'),('auto','0','6','6'),('auto','0','dual','dual'),('','1','6','4'),('6','1','4','6'),('dual','0','4','dual')]:
    cmd=functions+f"\nBROWAN_VPN_IP_FAMILY='{mode}'; BROWAN_VPN_IPV4_ONLY={legacy}; ssh_run() {{ printf '%s\\n' '{detected}'; }}; select_vpn_ip_family"
    result=subprocess.run(['bash','-c',cmd],capture_output=True,text=True,check=True)
    assert result.stdout.strip()==expected,(mode,result.stdout)
print('auto/override/legacy policy: PASS')
invalid=subprocess.run(['bash','-c',functions+'\nBROWAN_VPN_IP_FAMILY=invalid; select_vpn_ip_family'],capture_output=True,text=True)
assert invalid.returncode!=0
failed=subprocess.run(['bash','-c',functions+'\nssh_run() { return 1; }; BROWAN_VPN_IP_FAMILY=auto; select_vpn_ip_family'],capture_output=True,text=True)
assert failed.returncode!=0
print('invalid policy and failed detection rejected: PASS')

# Run the actual remote route detector against simulated routing tables.
import shlex
routes=[
 ('IPv4 only','default via 192.0.2.1 dev eth0','','4'),
 ('IPv6 only','','default via fe80::1 dev eth0','6'),
 ('dual','default via 192.0.2.1 dev eth0','default via fe80::1 dev eth0','dual'),
 ('unknown','','','dual'),
 ('ignore VPN','default dev tun0','default via fe80::1 dev eth0','6'),
 ('ignore linkdown','default via 192.0.2.1 dev eth0 linkdown','default via fe80::1 dev eth0','6'),
 ('ignore blackhole','blackhole default','','dual'),
]
for label,v4,v6,expected in routes:
    shim='''
ip() {
  case "$1" in
    -4) printf '%s\\n' V4;;
    -6) printf '%s\\n' V6;;
  esac
}
export -f ip
ssh_run() { bash -c "$1"; }
'''.replace('V4',shlex.quote(v4)).replace('V6',shlex.quote(v6))
    result=subprocess.run(['bash','-c',functions+shim+'\ndetect_vpn_ip_family'],capture_output=True,text=True,check=True)
    assert result.stdout.strip()==expected,(label,result.stdout,result.stderr)
    print('route detection '+label+': PASS')
