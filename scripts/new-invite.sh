#!/usr/bin/env bash
# Create a beta invite on the deployed gallery and print a ready-to-share login link.
#
#   ./scripts/new-invite.sh                                  # 1 use, 14 days
#   ./scripts/new-invite.sh --note "beta wave 1" --uses 5 --days 30
#   ./scripts/new-invite.sh list
#   ./scripts/new-invite.sh revoke <invite-id>
#
# `pnpm invites create` prints only the code; the link the invitee actually
# opens is `${PUBLIC_ORIGIN}/auth/login?invite=<code>`. This wrapper runs the
# CLI inside the deployed web container over SSH (the database is loopback-only
# on the host) and builds that link.
#
# Values come from .env, the same file the Ansible playbook uploads. Use
# DEPLOY_ENV_FILE to point at a different file.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.env}"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./scripts/new-invite.sh [create] [--by USER] [--note TEXT] [--uses N] [--days N]
       ./scripts/new-invite.sh list
       ./scripts/new-invite.sh revoke <invite-id>
       ./scripts/new-invite.sh --help

  create   (default) create an invite and print its login link. The raw code is
           printed once; the gallery stores only its SHA-256 hash.
  list     list invites with state, uses and note.
  revoke   revoke an invite by id; accounts that already used it stay.

Options for create:
  --by USER    admin username recorded as the creator (default: gallery-admin)
  --note TEXT  short note, 200 characters at most
  --uses N     how many identities may consume the code (default: 1)
  --days N     days until the code expires, 0 for never (default: 14)

Environment: .env (DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_PORT, DEPLOY_DIR,
PUBLIC_ORIGIN). DEPLOY_ENV_FILE overrides the path to .env.
EOF
}

[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE is missing; deploy the stack first (docs/16-deployment.md)"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DEPLOY_HOST="${DEPLOY_HOST:-192.168.88.222}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/solidcraft-gallery}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"

command -v ssh >/dev/null 2>&1 || fail "ssh is required"
[[ -n "$PUBLIC_ORIGIN" ]] || fail "PUBLIC_ORIGIN is empty in $ENV_FILE"

# Run `pnpm invites ...` inside the deployed web container. Arguments are
# shell-quoted for the remote side; nothing is interpolated unquoted.
remote() {
  local inner
  inner="$(printf '%q ' "$@")"
  ssh -o BatchMode=yes -o ConnectTimeout=10 -p "$DEPLOY_SSH_PORT" \
    "$DEPLOY_USER@$DEPLOY_HOST" \
    "cd $(printf '%q' "$DEPLOY_DIR") && docker compose -f compose.yaml --env-file .env exec -T web pnpm --silent $inner"
}

action=create
case "${1:-}" in
  create | list | revoke)
    action="$1"
    shift
    ;;
  --help | -h | help)
    usage
    exit 0
    ;;
esac

case "$action" in
  create)
    has_by=0
    for arg in "$@"; do
      [[ "$arg" == "--by" ]] && has_by=1
    done
    args=(invites create)
    ((has_by)) || args+=(--by gallery-admin)
    args+=("$@")

    output="$(remote "${args[@]}")" || {
      printf '%s\n' "$output" >&2
      fail "invite creation failed"
    }
    invite_id="$(printf '%s\n' "$output" | sed -n 's/^invite[[:space:]]\{1,\}//p' | head -n 1)"
    code="$(printf '%s\n' "$output" | sed -n 's/^code[[:space:]]\{1,\}//p' | head -n 1)"
    [[ -n "$code" ]] || {
      printf '%s\n' "$output" >&2
      fail "could not read the invite code from the CLI output"
    }

    printf 'invite  %s\n' "${invite_id:-unknown}"
    printf 'link    %s/auth/login?invite=%s\n' "${PUBLIC_ORIGIN%/}" "$code"
    printf 'the code is shown once; send the link before closing this terminal\n'
    ;;
  list)
    remote invites list
    ;;
  revoke)
    id="${1:-}"
    [[ -n "$id" ]] || usage
    remote invites revoke "$id"
    ;;
  *)
    usage
    exit 1
    ;;
esac
