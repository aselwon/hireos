#!/usr/bin/env bash
# Uruchamia wyłącznie właściciel. Brak SSH, pobierania zależności i zmian konfiguracji.
set -euo pipefail
if [[ $# -lt 4 || $1 != --owner ]]; then
    echo 'Użycie: bash ops/deploy.sh --owner ROOT deploy ID SOURCE | --owner ROOT rollback ID' >&2
    exit 2
fi
root=$(realpath -e -- "$2")
action=$3
release=$4
[[ $release =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*$ ]] || exit 2
[[ $action == deploy && $# == 5 || $action == rollback && $# == 4 ]] || exit 2
mkdir -p -- "$root/releases"
exec 9>"$root/.deploy.lock"
flock -n 9 || { echo 'Trwa inna operacja.' >&2; exit 1; }
target="$root/releases/$release"
staging="$root/releases/.staging-$$"
link="$root/.current-$$"
trap 'rm -rf -- "$staging"; rm -f -- "$link"' EXIT
if [[ $action == deploy ]]; then
    [[ ! -e $target ]] || { echo 'Release już istnieje; wybierz nowe ID.' >&2; exit 1; }
    source=$(realpath -e -- "$5")
    mkdir -- "$staging"
    # Jawna lista runtime: bez sekretów, bazy, node_modules i konfiguracji operatora.
    for item in server.mjs lib hireos/dist package.json; do
        [[ -e $source/$item ]] || exit 1
        [[ -z $(find "$source/$item" -type l -print -quit) ]] || exit 1
        mkdir -p -- "$(dirname "$staging/$item")"
        cp -R -- "$source/$item" "$staging/$item"
    done
    printf '%s\n' "$release" > "$staging/REVISION"
    mv -- "$staging" "$target"
fi
[[ -f $target/server.mjs && -f $target/REVISION && ! -L $target ]] || exit 1
previous=$(readlink "$root/current" || true)
ln -s -- "$target" "$link"
mv -Tf -- "$link" "$root/current"
printf 'Poprzedni release: %s\n' "${previous:-brak}"
# Restart i probe są lokalne; błąd wymaga decyzji właściciela o bazie i rollbacku.
systemctl restart hireos-preview
curl --fail --silent --show-error --retry 5 --retry-connrefused --retry-delay 1 \
    http://127.0.0.1:4317/login >/dev/null
printf 'Aktywny release: %s\n' "$release"
