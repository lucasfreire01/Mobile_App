#!/bin/sh
set -eu

if [ "${QUERY_STRING:-}" = "identity=1" ]; then
  mac=$(cat /sys/class/net/eth0/address 2>/dev/null || true)
  serial=$(fw_printenv -n serial 2>/dev/null || true)
  model=$(sed -n 's/^NAME=//p' /etc/os-release 2>/dev/null | tr -d '"')
  printf 'Content-Type: application/json\r\nCache-Control: no-store\r\n\r\n'
  printf '{"model":"%s","mac":"%s","serial":"%s"}\n' "$model" "$mac" "$serial"
  exit 0
fi
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

html() {
  printf 'Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n'
  printf '%s\n' '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link SagaNexus gateway</title><style>body{font:16px system-ui;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#172a24}input,button{font:inherit;padding:.8rem;width:100%;box-sizing:border-box}button{margin-top:.7rem}video{width:100%;margin-top:1rem}</style><h1>Link SagaNexus gateway</h1><p>Scan the QR shown in the SagaNexus app, or enter the 43-character code.</p><form method="post" autocomplete="off"><label for="code">Enrollment code</label><input id="code" name="code" minlength="43" maxlength="43" pattern="[A-Za-z0-9_-]{43}" required autocomplete="off" autocapitalize="off" spellcheck="false"><button>Link gateway</button></form><button id="scan" type="button">Scan QR</button><video id="camera" playsinline hidden></video><p id="message" role="status"></p><script>const button=document.getElementById("scan"),video=document.getElementById("camera"),input=document.getElementById("code"),message=document.getElementById("message");button.onclick=async()=>{if(!(typeof BarcodeDetector!=="undefined")){message.textContent="QR scan unavailable; enter the code manually.";return}let stream;try{const detector=new BarcodeDetector({formats:["qr_code"]});stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});video.srcObject=stream;video.hidden=false;await video.play();const scan=async()=>{if(video.hidden)return;try{for(const qr of await detector.detect(video)){if(/^[A-Za-z0-9_-]{43}$/.test(qr.rawValue)){input.value=qr.rawValue;stream.getTracks().forEach(t=>t.stop());video.hidden=true;message.textContent="Code scanned. Press Link gateway.";return}}}catch{}requestAnimationFrame(scan)};scan()}catch{if(stream)stream.getTracks().forEach(t=>t.stop());message.textContent="Camera unavailable; enter the code manually."}};</script>'
}

error_page() {
  if [ "${HTTP_ACCEPT:-}" = application/json ]; then
    printf 'Status: 400 Bad Request\r\nContent-Type: application/json\r\nCache-Control: no-store\r\n\r\n'
    printf '{"accepted":false,"error":"%s"}\n' "$1"
  else
    html
    printf '<h2>%s</h2></html>\n' "$1"
  fi
}

if [ "${REQUEST_METHOD:-GET}" != POST ]; then
  html
  printf '</html>\n'
  exit 0
fi

case "${HTTPS:-}" in on|ON|1) ;; *)
  if [ "${SERVER_PORT:-}" != 443 ]; then
    error_page 'HTTPS is required.'
    exit 0
  fi ;;
esac
case "${HTTP_HOST:-}" in ''|*[!A-Za-z0-9.:-]*) error_page 'Invalid host.'; exit 0 ;; esac
if [ -n "${HTTP_ORIGIN:-}" ] && [ "$HTTP_ORIGIN" != "https://$HTTP_HOST" ]; then
  error_page 'Request origin rejected.'
  exit 0
fi
length=${CONTENT_LENGTH:-0}
case "$length" in ''|*[!0-9]*) error_page 'Invalid request.'; exit 0 ;; esac
[ "$length" -eq 48 ] || { error_page 'Invalid request.'; exit 0; }
body=$(dd bs=1 count=48 2>/dev/null)
case "$body" in code=*) code=${body#code=} ;; *) code='' ;; esac
case "$code" in *[!A-Za-z0-9_-]*|'') code='' ;; esac
[ "${#code}" -eq 43 ] || { error_page 'Invalid enrollment code.'; exit 0; }
[ -s /etc/saganexus/bootstrap.conf ] || { error_page 'Package is not configured.'; exit 0; }
[ ! -e /etc/saganexus/enrollment.conf ] || { error_page 'Enrollment is already in progress.'; exit 0; }
. /etc/saganexus/bootstrap.conf
case "$API_URL" in https://[A-Za-z0-9.-]*|https://[A-Za-z0-9.-]*:[0-9]*) ;; *) error_page 'Backend URL is invalid.'; exit 0 ;; esac
temp=$(mktemp /etc/saganexus/enrollment.XXXXXX)
trap 'rm -f "$temp"' EXIT HUP INT TERM
umask 077
printf "API_URL='%s'\nENROLLMENT_CODE='%s'\nCA_BUNDLE='%s'\n" "$API_URL" "$code" "$CA_BUNDLE" > "$temp"
chmod 600 "$temp"
mv "$temp" /etc/saganexus/enrollment.conf
trap - EXIT HUP INT TERM
/usr/sbin/saganexus-enrollment-agent >/dev/null 2>&1 </dev/null &
if [ "${HTTP_ACCEPT:-}" = application/json ]; then
  printf 'Content-Type: application/json\r\nCache-Control: no-store\r\n\r\n{"accepted":true}\n'
else
  html
  printf '</html>\n'
fi
