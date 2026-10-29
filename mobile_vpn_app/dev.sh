#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$APP_DIR/.." && pwd)"
if [[ -f "$ROOT_DIR/mobile_vpn/package.json" ]]; then
  BACKEND_DIR="$ROOT_DIR/mobile_vpn"
else
  BACKEND_DIR="$ROOT_DIR"
fi
FRONTEND_DIR="$APP_DIR"
COMPOSE_FILE="$BACKEND_DIR/compose.yaml"
PIDS=()

cleanup() {
  local pid
  trap - EXIT INT TERM
  for pid in "${PIDS[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}

fail() {
  printf 'Erro: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail 'Docker não encontrado. Instale e inicie o Docker Desktop/Engine.'
command -v npm >/dev/null 2>&1 || fail 'npm não encontrado. Instale o Node.js.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose não está disponível.'
[[ -f "$BACKEND_DIR/.env" ]] || fail "Arquivo .env do backend não encontrado em $BACKEND_DIR. Copie o .env.example correspondente e configure as credenciais locais."
[[ -d "$BACKEND_DIR/node_modules" ]] || fail "Dependências do backend ausentes. Execute npm install em $BACKEND_DIR."
[[ -d "$FRONTEND_DIR/node_modules" ]] || fail 'Dependências do frontend ausentes. Execute: cd mobile_vpn_app && npm install'

API_PORT="${API_PORT:-$(awk -F= '$1 == "PORT" { gsub(/[[:space:]\r]/, "", $2); print $2; exit }' "$BACKEND_DIR/.env")}"
WEB_PORT="${WEB_PORT:-8081}"

port_is_available() {
  node -e 'const net = require("node:net"); const server = net.createServer(); server.once("error", () => process.exit(1)); server.listen(Number(process.argv[1]), "0.0.0.0", () => server.close(() => process.exit(0)))' "$1" >/dev/null 2>&1
}

[[ "$API_PORT" =~ ^[0-9]+$ ]] && ((API_PORT > 0 && API_PORT < 65536)) || fail 'PORT inválida no .env do backend.'
for attempt in $(seq 1 100); do
  if port_is_available "$API_PORT"; then
    break
  fi
  API_PORT=$((API_PORT + 1))
done
port_is_available "$API_PORT" || fail 'Não foi encontrada uma porta livre para a API.'

[[ "$WEB_PORT" =~ ^[0-9]+$ ]] && ((WEB_PORT > 0 && WEB_PORT < 65536)) || fail 'WEB_PORT inválida.'
for attempt in $(seq 1 100); do
  if port_is_available "$WEB_PORT"; then
    break
  fi
  WEB_PORT=$((WEB_PORT + 1))
done
port_is_available "$WEB_PORT" || fail 'Não foi encontrada uma porta web livre entre 8081 e 8180.'

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Iniciando PostgreSQL...\n'
docker compose -f "$COMPOSE_FILE" up -d postgres

printf 'Aguardando PostgreSQL ficar pronto...\n'
for attempt in $(seq 1 60); do
  if docker compose -f "$COMPOSE_FILE" exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 60 ]]; then
  fail "PostgreSQL não ficou pronto em 60 segundos. Confira: docker compose -f $COMPOSE_FILE logs postgres"
  fi
  sleep 1
done

export HOST="${HOST:-0.0.0.0}"
export PORT="$API_PORT"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://localhost:${API_PORT}/api/v1}"

start_service() {
  local name="$1"
  local directory="$2"
  local pid
  shift 2
  (
    cd "$directory"
    exec "$@"
  ) &
  pid="$!"
  PIDS+=("$pid")
  printf 'Iniciado: %s (PID %s)\n' "$name" "$pid"
}

start_service 'API Adonis' "$BACKEND_DIR" npm run dev
start_service 'Worker de rede' "$BACKEND_DIR" npm run worker:gateway-network
start_service 'Expo Web' "$FRONTEND_DIR" npm run web -- --port "$WEB_PORT"

printf '\nTudo iniciado. Frontend: http://localhost:%s | API: http://localhost:%s\n' "$WEB_PORT" "$API_PORT"
printf 'Use Ctrl+C para encerrar API, worker e frontend. O banco continuará ligado.\n\n'

while true; do
  for index in "${!PIDS[@]}"; do
    if ! kill -0 "${PIDS[$index]}" 2>/dev/null; then
      status=0
      wait "${PIDS[$index]}" || status=$?
      printf 'Um serviço encerrou (código %s); encerrando os demais.\n' "$status" >&2
      exit "$status"
    fi
  done
  sleep 1
done
