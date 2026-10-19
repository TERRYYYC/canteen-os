#!/usr/bin/env bash
# Run ONLY after the coordinator sends deploy-ready for this exact release.
set -euo pipefail
umask 077
operator=${KB_DEPLOY_USER:?Set KB_DEPLOY_USER to the intended deployment user}
root="$HOME/canteen-kb"
release=${1:-}
[[ "${2:-}" == --deploy-ready && "$release" =~ ^[a-z0-9][a-z0-9._-]{0,79}$ && "$release" != *..* ]] || { echo 'Usage: remote-deploy.sh RELEASE_ID --deploy-ready' >&2; exit 1; }
[[ "$(id -un)" == "$operator" && "$(uname -s)" == Linux ]] || { echo 'Expected the selected operator on Linux' >&2; exit 1; }
node="$root/runtime/node-v24.18.0-linux-x64/bin/node"
incoming="$root/incoming/$release"
destination="$root/releases/$release"
for part in "$root" "$root/runtime" "$root/releases" "$root/incoming" "$incoming" "$root/shared" "$root/shared/data" "$root/shared/backups"; do
  [[ -d "$part" && ! -L "$part" ]] || { echo "Invalid deployment directory: $part" >&2; exit 1; }
done
[[ ! -e "$destination" && ! -L "$destination" ]] || { echo 'Release already exists; use a new release ID' >&2; exit 1; }
[[ ! -e "$root/current" || -L "$root/current" ]] || { echo 'current must be a release symlink' >&2; exit 1; }
exec 9>"$root/shared/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
old_pid=$(systemctl --user show canteen-os-test.service -p MainPID --value)
[[ "$old_pid" != 0 ]]
old_restarts=$(systemctl --user show canteen-os-test.service -p NRestarts --value)
curl --fail --silent --max-time 10 http://127.0.0.1:4380/_test/status >"$root/shared/old-status-before.json"
"$node" "$incoming/scripts/sqlite-ops.mjs" runtime
"$node" "$incoming/scripts/release-manifest.mjs" verify "$incoming" "$release"
"$node" "$incoming/scripts/service-guards.mjs" old-status "$root/shared/old-status-before.json" "$root/shared/old-status-before.json"
ss -H -ltnp 'sport = :4390' >"$root/shared/listener-before.txt"
current_pid=$(systemctl --user show canteen-kb.service -p MainPID --value 2>/dev/null || true)
"$node" "$incoming/scripts/service-guards.mjs" port-owner "$root/shared/listener-before.txt" "${current_pid:-0}"
previous=''
if [[ -L "$root/current" ]]; then
  previous=$(readlink -f "$root/current")
  [[ "$previous" == "$root/releases/"* && -d "$previous" ]] || { echo 'Unexpected current target' >&2; exit 1; }
fi
# Install only locked production dependencies; no package lifecycle scripts.
export PATH="$(dirname "$node"):$PATH"
(cd "$incoming" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
"$node" "$incoming/scripts/release-manifest.mjs" verify "$incoming" "$release"
mv -T "$incoming" "$destination"
activated=false
finish() {
  result=$?
  trap - EXIT
  if [[ "$result" != 0 && "$activated" == true ]]; then
    systemctl --user stop canteen-kb.service || true
    echo "Deployment failed; stopped new service, retained data. Previous release: $previous" >&2
  fi
  if [[ "$(systemctl --user show canteen-os-test.service -p MainPID --value)" != "$old_pid" || "$(systemctl --user show canteen-os-test.service -p NRestarts --value)" != "$old_restarts" ]]; then
    echo 'Old service PID/restart count changed; investigate' >&2
    result=1
  fi
  if ! curl --fail --silent --max-time 10 http://127.0.0.1:4380/_test/status >"$root/shared/old-status-after.json" || ! "$node" "$destination/scripts/service-guards.mjs" old-status "$root/shared/old-status-before.json" "$root/shared/old-status-after.json"; then
    result=1
  fi
  exit "$result"
}
trap finish EXIT
if systemctl --user is-active --quiet canteen-kb.service; then
  activated=true
  systemctl --user stop canteen-kb.service
fi
if [[ -f "$root/shared/data/knowledge.sqlite" ]]; then
  timeout 120s "$node" "$destination/scripts/sqlite-ops.mjs" backup --data "$root/shared/data" --out "$root/shared/backups/pre-$release" --release "${previous##*/}"
  "$node" "$destination/scripts/sqlite-ops.mjs" verify --backup "$root/shared/backups/pre-$release"
fi
expected_schema=$("$node" -e 'console.log(require(process.argv[1]).schemaVersion)' "$destination/release.json")
# Pre-migrate with the fixed release's runner. Failure leaves current unchanged.
"$node" "$destination/scripts/migrate-database.mjs" "$root/shared/data" "$expected_schema"
mkdir -p "$HOME/.config/systemd/user"
install -m 600 "$destination/infra/canteen-kb.service" "$HOME/.config/systemd/user/canteen-kb.service"
ln -s "$destination" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
activated=true
systemctl --user daemon-reload
systemctl --user enable canteen-kb.service
systemctl --user restart canteen-kb.service
healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:4390/api/v1/health >"$root/shared/health.json"; then
    if "$node" -e 'const fs=require("node:fs"); const h=JSON.parse(fs.readFileSync(process.argv[1])); const r=JSON.parse(fs.readFileSync(process.argv[2])); if(h.ok!==true || h.releaseId!==r.id || h.schemaVersion!==r.schemaVersion) process.exit(1)' "$root/shared/health.json" "$destination/release.json"; then healthy=true; break; fi
  fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  systemctl --user stop canteen-kb.service
  echo "New service failed health validation and was stopped. Previous release: $previous. Data remains intact; do not auto-restore a database." >&2
  exit 1
fi
curl --fail --silent --max-time 10 http://127.0.0.1:4390/ >/dev/null
curl --fail --silent --max-time 10 http://127.0.0.1:4390/api/v1/recipes >/dev/null
ss -H -ltnp 'sport = :4390' >"$root/shared/listener-after.txt"
"$node" "$destination/scripts/service-guards.mjs" port-owner "$root/shared/listener-after.txt" "$(systemctl --user show canteen-kb.service -p MainPID --value)" required
echo "New release $release healthy on 127.0.0.1:4390; final old-service guard follows."
