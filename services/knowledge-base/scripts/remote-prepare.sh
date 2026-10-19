#!/usr/bin/env bash
# Run on a designated Linux host as an explicitly selected operator. Never starts/restarts either application.
set -euo pipefail
umask 077
operator=${KB_DEPLOY_USER:?Set KB_DEPLOY_USER to the intended deployment user}
root="$HOME/canteen-kb"
runtime=node-v24.18.0-linux-x64
source_runtime=${KB_SOURCE_RUNTIME:?Set KB_SOURCE_RUNTIME to the verified Node runtime directory}
[[ "$(id -un)" == "$operator" && "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'Expected the selected operator on Linux x86_64' >&2; exit 1; }
[[ -x "$source_runtime/bin/node" ]] || { echo 'Verified Node runtime is missing' >&2; exit 1; }
[[ ! -L "$root" && ! -L "$HOME" ]] || { echo 'Refusing a symlink root' >&2; exit 1; }
systemctl --user is-active --quiet canteen-os-test.service
curl --fail --silent --max-time 10 http://127.0.0.1:4380/_test/status >/dev/null
for part in runtime releases incoming shared shared/data shared/data/uploads shared/backups shared/restores; do
  [[ ! -L "$root/$part" ]] || { echo "Refusing symlink: $part" >&2; exit 1; }
  mkdir -p "$root/$part"
done
[[ ! -L "$root/runtime/$runtime" ]] || exit 1
if [[ ! -e "$root/runtime/$runtime" ]]; then
  temp_runtime=$(mktemp -d "$root/runtime/.copy-XXXXXXXX")
  trap 'rm -rf -- "$temp_runtime"' EXIT
  cp -a "$source_runtime/." "$temp_runtime/"
  "$temp_runtime/bin/node" --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; const db=new DatabaseSync(":memory:"); const v=db.prepare("SELECT sqlite_version() v").get().v; if(process.versions.node!=="24.18.0" || v!=="3.53.1") throw Error("Runtime differs from verified inventory"); db.close(); console.log(JSON.stringify({node:process.versions.node,sqlite:v}));'
  mv -T "$temp_runtime" "$root/runtime/$runtime"
  trap - EXIT
fi
systemctl --user is-active --quiet canteen-os-test.service
curl --fail --silent --max-time 10 http://127.0.0.1:4380/_test/status >/dev/null
echo 'Prepared isolated directories and runtime. No application has been started.'
