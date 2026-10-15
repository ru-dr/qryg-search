# SPDX-License-Identifier: GPL-3.0-or-later
import shutil
import subprocess

from .paths import BIN_DIR, EXTENSION_DIR, EXTENSION_PAYLOAD, REPO
from .plugins import remove_path
from .system import run
from .ui import CliError


def install(link=False):
    if not (REPO / "metadata.json").exists():
        raise CliError(f"run install from a QryG checkout, {REPO} has no metadata.json")
    EXTENSION_DIR.parent.mkdir(parents=True, exist_ok=True)
    remove_path(EXTENSION_DIR)
    if link:
        EXTENSION_DIR.symlink_to(REPO)
    else:
        EXTENSION_DIR.mkdir()
        for item in EXTENSION_PAYLOAD:
            source = REPO / item
            if source.is_dir():
                shutil.copytree(source, EXTENSION_DIR / item)
            elif source.exists():
                shutil.copy2(source, EXTENSION_DIR / item)
    result = run("glib-compile-schemas", str(EXTENSION_DIR / "schemas"))
    if result is None or result.returncode != 0:
        raise CliError("glib-compile-schemas failed")
    migrate_settings()
    BIN_DIR.mkdir(parents=True, exist_ok=True)
    cli = BIN_DIR / "qryg"
    remove_path(cli)
    cli.symlink_to(REPO / "bin" / "qryg")
    return cli


# Settings stored under the 1.1 schema path, before the schema moved under org.gnome.shell.extensions.
OLD_SETTINGS_PATH = "/io/github/ru_dr/QrygSearch/"
SETTINGS_PATH = "/org/gnome/shell/extensions/qryg-search/"


def migrate_settings():
    """Copies 1.1 settings to the new path once, when nothing is stored there yet."""
    old, new = run("dconf", "dump", OLD_SETTINGS_PATH), run("dconf", "dump", SETTINGS_PATH)
    if old is None or new is None or not old.stdout.strip() or new.stdout.strip():
        return False
    loaded = subprocess.run(["dconf", "load", SETTINGS_PATH], input=old.stdout, text=True, capture_output=True)
    return loaded.returncode == 0


def uninstall():
    run("gnome-extensions", "disable", "qryg-search@ru-dr")
    remove_path(EXTENSION_DIR)
    cli = BIN_DIR / "qryg"
    if cli.is_symlink() and cli.resolve() == (REPO / "bin" / "qryg").resolve():
        cli.unlink()
