#!/bin/sh
# Production-only solidcraft-cli update job.
#
# Installed by Ansible at <deploy_dir>/bin/update-cli. The cron entry calls
# `update-cli --scheduled`; operators can run `--check`, `--adopt`, `--rollback`
# or `--bootstrap` by hand.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=${DEPLOY_DIR:-$(dirname "$SCRIPT_DIR")}
ENV_FILE=${ENV_FILE:-$DEPLOY_DIR/.env}
LOG_TAG=solidcraft-cli-update
ECHO_OUTPUT=0
CAPTURING=0

log() {
  if command -v logger >/dev/null 2>&1; then
    logger -t "$LOG_TAG" -- "$*" 2>/dev/null || true
  fi
  if [ "$ECHO_OUTPUT" = "1" ] && [ "$CAPTURING" = "0" ]; then
    printf '%s\n' "$*" >&2
  fi
}

read_env() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

DEPLOY_ENV=${DEPLOY_ENV:-$(read_env DEPLOY_ENV)}
DEPLOY_ENV=${DEPLOY_ENV:-dev}
AUTO_UPDATE=${SOLIDCRAFT_CLI_AUTO_UPDATE:-$(read_env SOLIDCRAFT_CLI_AUTO_UPDATE)}
AUTO_UPDATE=${AUTO_UPDATE:-0}
CLI_DIR=${SOLIDCRAFT_CLI_DIR:-$(read_env SOLIDCRAFT_CLI_DIR)}
CLI_DIR=${CLI_DIR:-$DEPLOY_DIR/cli}
SMOKE_DIR=$CLI_DIR/smoke
WORKER_IMAGE=${WORKER_IMAGE:-$(read_env WORKER_IMAGE)}
WORKER_IMAGE=${WORKER_IMAGE:-gallery-worker:local}
RELEASE_REPO=${SOLIDCRAFT_RELEASE_REPO:-$(read_env SOLIDCRAFT_RELEASE_REPO)}
RELEASE_REPO=${RELEASE_REPO:-tangency-labs/solidcraft}
RELEASE_API=${SOLIDCRAFT_RELEASE_API:-$(read_env SOLIDCRAFT_RELEASE_API)}
RELEASE_API=${RELEASE_API:-https://api.github.com}
RELEASE_TOKEN=${SOLIDCRAFT_RELEASE_TOKEN:-$(read_env SOLIDCRAFT_RELEASE_TOKEN)}
KEEP=${SOLIDCRAFT_CLI_KEEP_VERSIONS:-$(read_env SOLIDCRAFT_CLI_KEEP_VERSIONS)}
KEEP=${KEEP:-5}
PRUNE_HOURS=${SOLIDCRAFT_CLI_PRUNE_MIN_AGE_HOURS:-$(read_env SOLIDCRAFT_CLI_PRUNE_MIN_AGE_HOURS)}
PRUNE_HOURS=${PRUNE_HOURS:-168}

if command -v docker >/dev/null 2>&1; then
  DOCKER=$(command -v docker)
else
  DOCKER=/usr/bin/docker
fi

usage() {
  cat <<'EOF'
Usage: update-cli <command>

  --scheduled          production cron entry (no-op unless DEPLOY_ENV=prod and
                       SOLIDCRAFT_CLI_AUTO_UPDATE=1)
  --check              show installed and latest versions; change nothing
  --stage              stage, canary and commit the latest release manually
  --bootstrap          install the latest release when no CLI is installed
  --adopt <path>       adopt a binary under <deploy_dir>/bin and detect its version
  --commit             commit a staged release after a successful canary
  --discard            remove a staged release
  --rollback           switch back to the previous release
EOF
}

run_updater() {
  "$DOCKER" run --rm --read-only --tmpfs /tmp:rw,size=512m \
    --cap-drop ALL --security-opt no-new-privileges \
    -v "$CLI_DIR:/opt/solidcraft" \
    -v "$DEPLOY_DIR/bin:/legacy:ro" \
    -e SOLIDCRAFT_CLI_DIR=/opt/solidcraft \
    -e SOLIDCRAFT_RELEASE_REPO="$RELEASE_REPO" \
    -e SOLIDCRAFT_RELEASE_API="$RELEASE_API" \
    -e SOLIDCRAFT_RELEASE_TOKEN="$RELEASE_TOKEN" \
    -e SOLIDCRAFT_CLI_KEEP_VERSIONS="$KEEP" \
    -e SOLIDCRAFT_CLI_PRUNE_MIN_AGE_HOURS="$PRUNE_HOURS" \
    -e DEPLOY_ENV="$DEPLOY_ENV" \
    -e SOLIDCRAFT_CLI_AUTO_UPDATE="$AUTO_UPDATE" \
    -e HOME=/tmp -e TMPDIR=/tmp \
    --entrypoint /app/node_modules/.bin/tsx \
    "$WORKER_IMAGE" /app/apps/worker/src/cli-update.ts "$@"
}

run_canary() {
  "$DOCKER" run --rm --read-only --tmpfs /tmp:rw,size=512m \
    --network none --cap-add SYS_ADMIN --security-opt seccomp=unconfined \
    -v "$CLI_DIR:/opt/solidcraft:ro" \
    -v "$SMOKE_DIR:/smoke:ro" \
    --entrypoint /app/node_modules/.bin/tsx \
    "$WORKER_IMAGE" /app/apps/worker/src/cli-canary.ts \
    --cli /opt/solidcraft/next/solidcraft-cli \
    --design /smoke/box.solidcraft \
    --out /tmp/out \
    --timeout 30
}

capture() {
  label=$1
  shift
  set +e
  output=$("$@" 2>&1)
  status=$?
  set -e
  CAPTURING=1
  if [ -n "$output" ]; then
    log "$label: $output"
  fi
  CAPTURING=0
  if [ "$ECHO_OUTPUT" = "1" ] && [ -n "$output" ]; then
    printf '%s\n' "$output"
  fi
  return "$status"
}

lock_job() {
  mkdir -p "$CLI_DIR"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$CLI_DIR/.update-job.lock"
    if ! flock -n 9; then
      log "another solidcraft-cli update is already running"
      exit 0
    fi
  fi
}

stage_then_commit() {
  status=0
  capture stage run_updater "$@" || status=$?
  if [ "$status" -eq 0 ]; then
    log "solidcraft-cli is up to date"
    return 0
  fi
  if [ "$status" -ne 10 ]; then
    log "solidcraft-cli staging failed (exit $status)"
    return 1
  fi

  if ! capture canary run_canary; then
    capture discard run_updater --discard || true
    log "solidcraft-cli canary failed; the current CLI was left in place"
    return 1
  fi

  if ! capture commit run_updater --commit; then
    log "solidcraft-cli commit failed; the staged release is still in next"
    return 1
  fi
  log "solidcraft-cli update committed"
}

if [ "$#" -eq 0 ]; then
  usage
  exit 2
fi

command=$1
shift

ECHO_OUTPUT=1
case "$command" in
  --scheduled)
    ECHO_OUTPUT=0
    if [ "$DEPLOY_ENV" != "prod" ] || [ "$AUTO_UPDATE" != "1" ]; then
      log "automatic solidcraft-cli updates are disabled (DEPLOY_ENV=$DEPLOY_ENV, AUTO_UPDATE=$AUTO_UPDATE)"
      exit 0
    fi
    lock_job
    stage_then_commit --scheduled --stage
    ;;
  --bootstrap)
    lock_job
    stage_then_commit --bootstrap
    ;;
  --check)
    capture check run_updater --check
    ;;
  --stage)
    lock_job
    stage_then_commit --stage
    ;;
  --rollback)
    lock_job
    capture rollback run_updater --rollback
    ;;
  --commit)
    lock_job
    capture commit run_updater --commit
    ;;
  --discard)
    lock_job
    capture discard run_updater --discard
    ;;
  --adopt)
    if [ "$#" -ne 1 ]; then
      usage
      exit 2
    fi
    adopt_path=$1
    case "$adopt_path" in
      "$DEPLOY_DIR"/bin/*) container_path=/legacy/${adopt_path#"$DEPLOY_DIR"/bin/} ;;
      *)
        log "adopt path must live under $DEPLOY_DIR/bin"
        exit 2
        ;;
    esac
    lock_job
    capture adopt run_updater --adopt "$container_path"
    ;;
  --help|-h)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
