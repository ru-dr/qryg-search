# SPDX-License-Identifier: GPL-3.0-or-later
import os
import re
import shutil
import subprocess

from .ui import CliError


def run(*cmd, input=None):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, input=input)
    except FileNotFoundError:
        return None


def git(*args, cwd=None, missing="git is not installed"):
    """Runs git without ever asking for a password, and raises CliError when it fails."""
    try:
        result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True,
                                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    except FileNotFoundError:
        raise CliError(missing)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise CliError(detail.splitlines()[-1] if detail else f"git {args[0]} failed")
    return result.stdout.strip()


def remove_path(path):
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)


def extension_state(uuid):
    result = run("gnome-extensions", "info", uuid)
    if result is None or result.returncode != 0:
        return None
    match = re.search(r"State:\s*(\S+)", result.stdout)
    return match.group(1) if match else "UNKNOWN"


def is_active(state):
    return state in ("ACTIVE", "ENABLED")
