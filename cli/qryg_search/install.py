# SPDX-License-Identifier: GPL-3.0-or-later
import shutil

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
    BIN_DIR.mkdir(parents=True, exist_ok=True)
    cli = BIN_DIR / "qryg"
    remove_path(cli)
    cli.symlink_to(REPO / "bin" / "qryg")
    return cli


def uninstall():
    run("gnome-extensions", "disable", "qryg-search@ru-dr")
    remove_path(EXTENSION_DIR)
    cli = BIN_DIR / "qryg"
    if cli.is_symlink() and cli.resolve() == (REPO / "bin" / "qryg").resolve():
        cli.unlink()
