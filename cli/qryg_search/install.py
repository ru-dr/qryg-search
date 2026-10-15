# SPDX-License-Identifier: GPL-3.0-or-later
import shutil

from .paths import BIN_DIR, CLI_SCRIPT, EXTENSION_DIR, EXTENSION_PAYLOAD, REPO, SETTINGS_PATH, UUID
from .system import remove_path, run
from .ui import CliError

# Settings stored under the 1.1 schema path, before the schema moved under org.gnome.shell.extensions.
OLD_SETTINGS_PATH = "/io/github/ru_dr/QrygSearch/"


def _is_checkout_itself():
    """True when the repo was cloned straight into the extensions folder, so installing must not delete it."""
    return not EXTENSION_DIR.is_symlink() and EXTENSION_DIR.exists() and EXTENSION_DIR.resolve() == REPO


def install(link=False):
    if not (REPO / "metadata.json").exists():
        raise CliError(f"run install from a QryG checkout, {REPO} has no metadata.json")
    if not _is_checkout_itself():
        EXTENSION_DIR.parent.mkdir(parents=True, exist_ok=True)
        remove_path(EXTENSION_DIR)
        if link:
            EXTENSION_DIR.symlink_to(REPO)
        else:
            _copy_payload()
    result = run("glib-compile-schemas", str(EXTENSION_DIR / "schemas"))
    if result is None or result.returncode != 0:
        raise CliError("glib-compile-schemas failed")
    migrated = migrate_settings()
    BIN_DIR.mkdir(parents=True, exist_ok=True)
    cli = BIN_DIR / "qryg"
    remove_path(cli)
    cli.symlink_to(CLI_SCRIPT)
    return cli, migrated


def _copy_payload():
    EXTENSION_DIR.mkdir()
    for item in EXTENSION_PAYLOAD:
        source = REPO / item
        if source.is_dir():
            shutil.copytree(source, EXTENSION_DIR / item)
        elif source.exists():
            shutil.copy2(source, EXTENSION_DIR / item)


def migrate_settings():
    """Copies 1.1 settings to the new path once. Returns None when there is nothing to copy, else whether it worked."""
    old, new = run("dconf", "dump", OLD_SETTINGS_PATH), run("dconf", "dump", SETTINGS_PATH)
    if old is None or new is None or not old.stdout.strip() or new.stdout.strip():
        return None
    loaded = run("dconf", "load", SETTINGS_PATH, input=old.stdout)
    return loaded is not None and loaded.returncode == 0


def uninstall():
    run("gnome-extensions", "disable", UUID)
    if _is_checkout_itself():
        raise CliError(f"{EXTENSION_DIR} is this checkout; delete it yourself if you mean to")
    remove_path(EXTENSION_DIR)
    cli = BIN_DIR / "qryg"
    if cli.is_symlink() and cli.resolve() == CLI_SCRIPT.resolve():
        cli.unlink()
