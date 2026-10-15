#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Installs or updates QryG Search from GitHub, with the qryg command line tool:
#
#   curl -fsSL https://raw.githubusercontent.com/ru-dr/qryg-search/main/install.sh | bash
#
# Run it again to update. QRYG_REF picks a tag or branch instead of the latest release, such as QRYG_REF=main.
set -euo pipefail

main() {
    local repo="${QRYG_REPO:-https://github.com/ru-dr/qryg-search.git}"
    local src="${XDG_DATA_HOME:-$HOME/.local/share}/qryg-search/src"
    local ref="${QRYG_REF:-}"

    for tool in git python3 gnome-extensions glib-compile-schemas; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            echo "qryg-search: $tool is needed, install it first" >&2
            exit 1
        fi
    done

    if [ -d "$src/.git" ]; then
        echo "Updating $src"
        git -C "$src" fetch --quiet --tags --force origin
    else
        echo "Downloading QryG Search to $src"
        mkdir -p "$(dirname "$src")"
        git clone --quiet "$repo" "$src"
    fi

    if [ -z "$ref" ]; then
        ref="$(git -C "$src" tag --list 'v*' --sort=-version:refname | grep -v -- - | head -n 1 || true)"
        ref="${ref:-main}"
    fi
    if git -C "$src" show-ref --verify --quiet "refs/remotes/origin/$ref"; then
        git -C "$src" checkout --quiet -B "$ref" "origin/$ref"
    else
        git -C "$src" checkout --quiet --detach "$ref"
    fi
    echo "Installing $ref"
    "$src/bin/qryg" install

    case ":$PATH:" in
        *":$HOME/.local/bin:"*) ;;
        *) echo "Add ~/.local/bin to your PATH to use the qryg command" ;;
    esac
}

main "$@"
