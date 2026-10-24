# Appendix C — `solidcraft-cli` recipes

Every command below uses the pinned CLI version. Check it first:

```sh
solidcraft-cli --version
solidcraft-cli commands | jq '.[].id' | head
```

The CLI is the only component that understands a design. The site treats it as an untrusted-input
renderer and runs it in a sandbox.

## Validate and inspect a design

Opening the file is the validation: a malformed container fails before any command runs.

```sh
solidcraft-cli eval designs/case.solidcraft --json-out /tmp/metrics.json
```

`eval` (alias `inspect`) opens the design, evaluates the timeline and writes measurements as JSON:
volume, area, bounding box, centre of mass, body count. A non-zero exit code is a failed ingest.

To inspect the timeline without writing a script:

```sh
cat > inspect.json <<'EOF'
{"commands":[{"command":"document.inspect","params":{"measure":true,"sketches":false,"joints":false}}]}
EOF
solidcraft-cli run inspect.json --in designs/case.solidcraft
```

## Lean a container (strip the model cache)

Format-level, no rebuild, always works:

```sh
cp designs/case.solidcraft /tmp/case.lean.solidcraft
zip -d /tmp/case.lean.solidcraft 'cache/*'
unzip -l /tmp/case.lean.solidcraft | grep cache || echo "lean"
```

Canonical, through the app (opens and re-saves without the cache):

```sh
cat > lean.json <<'EOF'
{"commands":[
  {"command":"file.save_as","params":{"path":"/tmp/case.lean.solidcraft","format":"container","cache":false}}
]}
EOF
solidcraft-cli run lean.json --in designs/case.solidcraft
```

`format` may be `container` or `json`. `compression` may be `fast` or `compact`; `fast` is better for
git (large blobs stored, deltas work). `cache: false` is the important part.

A JSON `.solidcraft` (pretty-printed, diffable, no cache) for designs without binary imports:

```sh
cat > json.json <<'EOF'
{"commands":[
  {"command":"file.save_as","params":{"path":"/tmp/case.solidcraft","format":"json","cache":false}}
]}
EOF
solidcraft-cli run json.json --in designs/case.solidcraft
```

## Render previews

```sh
solidcraft-cli snapshot designs/case.solidcraft \
  --out /tmp/iso.png --width 1200 --height 900 --view iso --no-grid --no-axes

solidcraft-cli snapshot designs/case.solidcraft \
  --out /tmp/top.png --width 1200 --height 900 --view top --no-grid --no-axes

solidcraft-cli snapshot designs/case.solidcraft \
  --out /tmp/front.png --width 1200 --height 900 --view front --no-grid --no-axes
```

Views: `iso`, `front`, `back`, `top`, `bottom`, `left`, `right`, `home`, `fit`, or a named view saved
with `view.save`. `--camera '{"target":[0,0,0],"yaw":0.7,"pitch":0.5,"distance":180}'` gives an exact
camera. `--section z=27` cuts the model (same as Section Analysis), `--tool NAME` highlights a tool
body, `--body NAME:opacity=0.3,color=#cc3333` overrides a body's look.

The CPU rasterizer is used when no GPU adapter is available; the reply says which renderer ran.

## Export derivatives

```sh
solidcraft-cli run --in designs/case.solidcraft --out /tmp/case.step
solidcraft-cli run --in designs/case.solidcraft --out /tmp/case.stl
```

Formats are inferred from the extension: `step`, `3mf`, `stl`, `obj`, `urdf`. An assembly exports
with its components. A failure is non-fatal for the site: the version is published without that
download.

## Check linked components (assembly closure)

```sh
cat > links.json <<'EOF'
{"commands":[{"command":"component.links","params":{}}]}
EOF
solidcraft-cli run links.json --in designs/assembly.solidcraft
```

Every returned path must resolve inside the repository. A path outside it produces a
`dependencies_missing` warning and an incomplete preview.

## Export a design as a command script

Useful for CI diffs and for turning a hand-built model into a generator:

```sh
cat > script.json <<'EOF'
{"commands":[{"command":"timeline.export_script","params":{"path":"/tmp/case.script.json"}}]}
EOF
solidcraft-cli run script.json --in designs/case.solidcraft
```

The output is a `{"commands":[…]}` document that `solidcraft-cli run` replays.

## Publish through the API

```sh
TOKEN="gallery_pat_…"
PROJECT="0b0e…"

curl -fsS -X POST "https://gallery.example/api/v1/projects/$PROJECT/publish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -F "design=@/tmp/case.lean.solidcraft" \
  -F "tag=v1.2.0" \
  -F "message=Pi case v1.2.0"
```

The response is `202` with `version_id`, `commit`, `status` and `status_url`. Poll the status
endpoint or watch the dashboard.

## Connect an external repository

```sh
curl -fsS -X POST "https://gallery.example/api/v1/projects" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"external","url":"https://github.com/jane/pi-case"}'
```

Private repositories are **later**; the API returns `403` with a clear message.

## Create an API token

```sh
curl -fsS -X POST "https://gallery.example/api/v1/tokens" \
  -H "Cookie: __Host-gallery_session=…" \
  -H "X-CSRF-Token: …" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci","scopes":["write"],"expires_in_days":90}'
```

The raw token is returned once. Store it in a secret manager, not in a repository.

## Webhook test (local)

```sh
BODY='{"ref":"refs/heads/main","after":"'"$SHA"'","repository":{"id":123}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
curl -fsS -X POST http://localhost:3000/webhooks/github \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -H "Content-Type: application/json" \
  --data "$BODY"
```

## Sandbox invocation (illustrative)

The worker wraps every CLI call; do not run it directly on untrusted files in production.

```sh
nsjail --mode o \
  --disable_clone_newnet \
  --user 65534 --group 65534 \
  --chroot /srv/solidcraft-cli \
  --cwd /work \
  --time_limit 60 \
  --rlimit_as 1024 --rlimit_cpu 60 --rlimit_nofile 256 \
  --max_cpus 1 \
  --bindmount_ro /tmp/case.lean.solidcraft:/work/case.solidcraft \
  --bindmount /tmp/out:/work/out \
  -- /bin/solidcraft-cli snapshot /work/case.solidcraft \
       --out /work/out/iso.png --width 1200 --height 900 --view iso --no-grid --no-axes
```

Validate the exact flags on the target distribution during the M0 spike; `bubblewrap` is the
fallback if `nsjail` is unavailable.

## Failure triage

| Symptom | Likely cause | Check |
|---|---|---|
| `design_unreadable` | truncated/corrupt ZIP, wrong file | `unzip -t`, `file` |
| `design_too_large` | cache included, imports | `unzip -l`, size |
| `render_timeout` | heavy assembly, cold CPU | run locally with `time`, raise only per job |
| `renderer_outdated` | design format newer than the CLI | compare `document.json` `format` with the CLI's "up to" number; upgrade `solidcraft-cli` |
| `render_failed` | CLI crash, unsupported geometry | run with `RUST_BACKTRACE=1`, capture version |
| `dependencies_missing` | linked components outside repo | `component.links`, include the parts |
| Blank images | sketch-only design, no bodies | `eval` body count; use placeholder |
| `eval` non-zero | invalid timeline, missing plugin feature | open in the desktop app, inspect errors |

## Version pinning

Record the CLI version in the deployment (`SOLIDCRAFT_CLI_VERSION`) and in every fixture's expected
output. Upgrade procedure:

1. Build a worker image with the new CLI.
2. Run the contract and golden-image suites.
3. Bump `render-vN` if output changed.
4. Re-render a sample of projects; compare visually.
5. Roll out; keep the previous image for one week.
