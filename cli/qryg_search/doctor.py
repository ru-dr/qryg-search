# SPDX-License-Identifier: GPL-3.0-or-later
import re
import shutil
import time
from pathlib import Path

from .paths import EXTENSION_DIR, USER_STYLES, UUID
from .system import extension_state, is_active, run
from .ui import bad, bold, ok, warn

SHORTCUT_SCHEMAS = [
    "org.gnome.desktop.wm.keybindings",
    "org.gnome.shell.keybindings",
    "org.gnome.mutter.keybindings",
    "org.gnome.mutter.wayland.keybindings",
    "org.gnome.settings-daemon.plugins.media-keys",
]
PLOCATE_DB = Path("/var/lib/plocate/plocate.db")


def _normalize(accelerator):
    return accelerator.lower().replace("<primary>", "<control>").replace("<ctrl>", "<control>")


def shortcut_conflicts(accelerator):
    wanted = _normalize(accelerator)
    found = []
    for schema in SHORTCUT_SCHEMAS:
        result = run("gsettings", "list-recursively", schema)
        if not result or result.returncode != 0:
            continue
        for line in result.stdout.splitlines():
            parts = line.split(" ", 2)
            if len(parts) == 3 and any(_normalize(v) == wanted for v in re.findall(r"'([^']*)'", parts[2])):
                found.append(f"{parts[0]} {parts[1]}")
    return found


def _check_extension():
    state = extension_state(UUID)
    if state is None and (EXTENSION_DIR / "metadata.json").exists():
        warn("installed, log out and back in to load it, then: qryg enable")
    elif state is None:
        bad("extension not installed, run `qryg install`")
    elif is_active(state):
        ok(f"extension {state.lower()}")
    else:
        warn(f"extension state {state}, log out and back in, then `qryg enable`")
    if is_active(extension_state("spotlight@nin")):
        warn("the original Spotlight extension is also enabled: gnome-extensions disable spotlight@nin")


def _check_plocate():
    if not shutil.which("plocate"):
        bad("plocate missing, file search falls back to recent files only")
    elif PLOCATE_DB.exists():
        hours = (time.time() - PLOCATE_DB.stat().st_mtime) / 3600
        (ok if hours < 36 else warn)(f"plocate index updated {hours:.0f} h ago")
    else:
        warn("plocate index not built yet, run: sudo updatedb")


def _check_clipboard():
    if is_active(extension_state("copyous@boerdereinar.dev")):
        ok("clipboard manager found, clipboard plugin available")
    else:
        warn("no supported clipboard manager enabled, clipboard plugin hidden")


def _check_overview_search():
    result = run("dconf", "read", "/org/gnome/shell/extensions/just-perfection/search")
    if result and result.stdout.strip() == "false":
        warn("Just Perfection hides the Overview search, which breaks QryG at login. "
             "Fix: dconf write /org/gnome/shell/extensions/just-perfection/search true")


def _check_style(settings):
    name = settings.get("style")
    if name and not (USER_STYLES / f"{name}.css").exists():
        warn(f"style {name} not found in {USER_STYLES}, using the built-in look. Fix: qryg style off")


def run_doctor(settings, catalog):
    print(bold("qryg doctor"))
    _check_extension()
    _check_style(settings)
    _check_plocate()
    _check_clipboard()
    _check_overview_search()
    for accelerator in settings.get("toggle-shortcut"):
        conflicts = shortcut_conflicts(accelerator)
        for where in conflicts:
            warn(f"{accelerator} is also bound in {where}")
        if not conflicts:
            ok(f"{accelerator} has no conflicts")
    used = {}
    for manifest in catalog.all().values():
        keyword = catalog.keyword(manifest)
        if keyword and catalog.is_enabled(manifest):
            used.setdefault(keyword.lower(), []).append(manifest["id"])
    for keyword, owners in used.items():
        if len(owners) > 1:
            warn(f"prefix {keyword} is used by {', '.join(owners)}; change one with `qryg keyword`")
