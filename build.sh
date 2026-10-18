#!/usr/bin/env bash
set -euo pipefail

cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

node_bin="${NODE_BIN:-node}"
if ! command -v "$node_bin" >/dev/null 2>&1; then
    echo "Node.js was not found. Install the version in .nvmrc or set NODE_BIN." >&2
    exit 1
fi

"$node_bin" -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Node.js >=24 is required. Install Node.js 24+ or set NODE_BIN; see README.build.md."); process.exit(1); }'

if [[ -n "${NPM_CLI:-}" ]] && command -v cygpath >/dev/null 2>&1; then
    export NPM_CLI="$(cygpath -w "$NPM_CLI")"
fi

exec "$node_bin" scripts/build.mts "$@"
