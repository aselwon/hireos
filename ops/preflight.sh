#!/usr/bin/env bash
# Kontrola lokalna; uruchamia ręcznie właściciel, bez restartu i sieci.
set +x
set -euo pipefail
umask 077
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
# Diagnostyka Node trafia do stałego komunikatu, nigdy do logów z wartościami env.
if ! node --no-warnings --experimental-sqlite "$script_dir/preflight.mjs" "$@" 2>/dev/null; then
    echo 'BŁĄD: preflight nie przeszedł; wdrożenie wstrzymane.' >&2
    exit 1
fi
