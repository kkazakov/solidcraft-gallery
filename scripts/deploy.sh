#!/usr/bin/env bash
# Deploy SolidCraft Gallery to the host described by .env.
#
#   ./scripts/deploy.sh              full deployment
#   ./scripts/deploy.sh --check      validate Compose and Ansible without connecting
#   ./scripts/deploy.sh --help
#
# The script is the only entry point that needs to know where the repository,
# the virtual environment and .env live. The actual remote work is Ansible.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.env}"
MODE="${1:-deploy}"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy.sh [--check|--help]

  (no argument)  Build the images, then deploy and verify the remote stack.
  --check        Validate .env, Compose, shell scripts and the Ansible syntax.
  --help         Show this help.

Configuration comes from .env next to this repository. Copy .env.example and
fill it in before the first deployment.
EOF
}

case "$MODE" in
  deploy | --check | --help) ;;
  *)
    usage
    fail "unknown argument: $MODE"
    ;;
esac

if [[ "$MODE" == "--help" ]]; then
  usage
  exit 0
fi

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE is missing. Copy .env.example to .env and fill it in."
[[ -r "$ENV_FILE" ]] || fail "$ENV_FILE is not readable."

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Sensible defaults for the single-host deployment.
DEPLOY_HOST="${DEPLOY_HOST:-192.168.88.222}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/solidcraft-gallery}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_ALLOW_DIRTY="${DEPLOY_ALLOW_DIRTY:-0}"
WEB_PORT="${WEB_PORT:-8080}"
FORGEJO_PORT="${FORGEJO_PORT:-8081}"
CADDY_AUTO_HTTPS="${CADDY_AUTO_HTTPS:-off}"
SOLIDCRAFT_CLI_PATH="${SOLIDCRAFT_CLI_PATH:-$DEPLOY_DIR/bin/solidcraft-cli}"
SOLIDCRAFT_CLI_SOURCE="${SOLIDCRAFT_CLI_SOURCE:-}"

export DEPLOY_REPO_ROOT="$ROOT_DIR"
export DEPLOY_ENV_FILE="$ENV_FILE"
export DEPLOY_HOST DEPLOY_USER DEPLOY_SSH_PORT DEPLOY_DIR DEPLOY_ALLOW_DIRTY
export WEB_PORT FORGEJO_PORT CADDY_AUTO_HTTPS
export SOLIDCRAFT_CLI_PATH SOLIDCRAFT_CLI_SOURCE

require_value() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "$value" ]] || fail "$name is empty in .env"
}

for name in \
  WEB_DOMAIN FORGEJO_DOMAIN PUBLIC_ORIGIN FORGEJO_PUBLIC_URL \
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB \
  FORGEJO_DB_NAME FORGEJO_DB_USER FORGEJO_DB_PASSWORD \
  SESSION_SECRET TOKEN_ENC_KEY SIGNED_URL_SECRET; do
  require_value "$name"
done

for name in SESSION_SECRET TOKEN_ENC_KEY SIGNED_URL_SECRET POSTGRES_PASSWORD FORGEJO_DB_PASSWORD; do
  value="${!name}"
  [[ "$value" != "change-me" ]] || fail "$name is still change-me in .env"
done

[[ "$CADDY_AUTO_HTTPS" == "on" || "$CADDY_AUTO_HTTPS" == "off" ]] || fail "CADDY_AUTO_HTTPS must be on or off"
[[ "$WEB_PORT" =~ ^[0-9]+$ ]] || fail "WEB_PORT must be numeric"
[[ "$FORGEJO_PORT" =~ ^[0-9]+$ ]] || fail "FORGEJO_PORT must be numeric"
[[ "$DEPLOY_DIR" == /* ]] || fail "DEPLOY_DIR must be absolute"
[[ "$SOLIDCRAFT_CLI_PATH" == /* ]] || fail "SOLIDCRAFT_CLI_PATH must be absolute"
[[ "$SOLIDCRAFT_CLI_PATH" == "$DEPLOY_DIR"/* ]] || fail "SOLIDCRAFT_CLI_PATH must live under DEPLOY_DIR"

if [[ -n "$SOLIDCRAFT_CLI_SOURCE" && ! -f "$SOLIDCRAFT_CLI_SOURCE" ]]; then
  fail "SOLIDCRAFT_CLI_SOURCE does not exist: $SOLIDCRAFT_CLI_SOURCE"
fi
if [[ -n "$DEPLOY_SSH_KEY" && ! -f "$DEPLOY_SSH_KEY" ]]; then
  fail "DEPLOY_SSH_KEY does not exist: $DEPLOY_SSH_KEY"
fi

if [[ "$DEPLOY_ALLOW_DIRTY" != "1" ]]; then
  if [[ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
    fail "working tree is dirty; commit or set DEPLOY_ALLOW_DIRTY=1 for a development deploy"
  fi
fi

compose_args=(-f "$ROOT_DIR/infra/compose.yaml")
if [[ "$CADDY_AUTO_HTTPS" == "on" ]]; then
  compose_args+=(-f "$ROOT_DIR/infra/compose.tls.yaml")
fi

sh -n "$ROOT_DIR/infra/postgres/init.sh" || fail "infra/postgres/init.sh has a syntax error"

if command -v docker >/dev/null 2>&1; then
  docker compose "${compose_args[@]}" --env-file "$ENV_FILE" config --quiet ||
    fail "Compose rejected the production configuration"
  docker compose -f "$ROOT_DIR/infra/compose.yaml" -f "$ROOT_DIR/infra/compose.build.yaml" \
    --env-file "$ENV_FILE" config --quiet ||
    fail "Compose rejected the build configuration"
else
  [[ "$MODE" == "--check" ]] || fail "Docker is required on the controller (it builds the images)"
fi

ANSIBLE_PLAYBOOK="${ANSIBLE_PLAYBOOK:-}"
if [[ -z "$ANSIBLE_PLAYBOOK" ]]; then
  if [[ -x "$ROOT_DIR/.venv/bin/ansible-playbook" ]]; then
    ANSIBLE_PLAYBOOK="$ROOT_DIR/.venv/bin/ansible-playbook"
  elif command -v ansible-playbook >/dev/null 2>&1; then
    ANSIBLE_PLAYBOOK="$(command -v ansible-playbook)"
  else
    fail "ansible-playbook not found. Run: uv venv .venv && uv pip install -r infra/ansible/requirements.txt"
  fi
fi

export ANSIBLE_CONFIG="$ROOT_DIR/infra/ansible/ansible.cfg"

inventory="${DEPLOY_USER}@${DEPLOY_HOST},"
ansible_args=(
  -i "$inventory"
  -e "ansible_port=$DEPLOY_SSH_PORT"
  -e "deploy_host=$DEPLOY_HOST"
  -e "deploy_dir=$DEPLOY_DIR"
  -e "repo_root=$ROOT_DIR"
)
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  ansible_args+=(--private-key "$DEPLOY_SSH_KEY")
fi
if [[ "${DEPLOY_VERBOSE:-0}" == "1" ]]; then
  ansible_args+=(-v)
fi

if [[ "$MODE" == "--check" ]]; then
  "$ANSIBLE_PLAYBOOK" "${ansible_args[@]}" --syntax-check "$ROOT_DIR/infra/ansible/deploy.yml"
  printf 'Configuration is valid. Deploy with ./scripts/deploy.sh\n'
  exit 0
fi

command -v flock >/dev/null 2>&1 || fail "flock is required to serialize deployments"
exec 9>"$ROOT_DIR/deploy.lock"
if ! flock -n 9; then
  fail "another deployment is already running (deploy.lock)"
fi

dirty_note=""
if [[ "$DEPLOY_ALLOW_DIRTY" == "1" && -n "$(git -C "$ROOT_DIR" status --porcelain)" ]]; then
  dirty_note=" (dirty working tree)"
fi

printf '==> Deploying %s%s to %s@%s:%s\n' \
  "$ROOT_DIR" "$dirty_note" "$DEPLOY_USER" "$DEPLOY_HOST" "$DEPLOY_DIR"
printf '==> Web %s:%s, Forgejo %s:%s, TLS %s\n' \
  "$DEPLOY_HOST" "$WEB_PORT" "$DEPLOY_HOST" "$FORGEJO_PORT" "$CADDY_AUTO_HTTPS"

ssh_args=(-o BatchMode=yes -o ConnectTimeout=10 -p "$DEPLOY_SSH_PORT")
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  ssh_args+=(-i "$DEPLOY_SSH_KEY")
fi
ssh "${ssh_args[@]}" "$DEPLOY_USER@$DEPLOY_HOST" true ||
  fail "cannot SSH to $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_SSH_PORT"

"$ANSIBLE_PLAYBOOK" "${ansible_args[@]}" "$ROOT_DIR/infra/ansible/deploy.yml"

printf '\nDeployment finished.\n'
printf '  Web:     http://%s:%s/\n' "$DEPLOY_HOST" "$WEB_PORT"
printf '  Forgejo: http://%s:%s/\n' "$DEPLOY_HOST" "$FORGEJO_PORT"
if [[ "$CADDY_AUTO_HTTPS" == "on" ]]; then
  printf '  TLS:     https://%s/ and https://%s/\n' "$WEB_DOMAIN" "$FORGEJO_DOMAIN"
else
  printf '  Domains: http://%s:%s/ and http://%s:%s/ (TLS is off)\n' \
    "$WEB_DOMAIN" "$WEB_PORT" "$FORGEJO_DOMAIN" "$FORGEJO_PORT"
fi
printf '  Logs:    ssh %s@%s "docker compose -f %s/compose.yaml logs -f"\n' \
  "$DEPLOY_USER" "$DEPLOY_HOST" "$DEPLOY_DIR"
