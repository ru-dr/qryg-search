# SPDX-License-Identifier: GPL-3.0-or-later
import re
import subprocess


def run(*cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        return None


def extension_state(uuid):
    result = run("gnome-extensions", "info", uuid)
    if result is None or result.returncode != 0:
        return None
    match = re.search(r"State:\s*(\S+)", result.stdout)
    return match.group(1) if match else "UNKNOWN"


def is_active(state):
    return state in ("ACTIVE", "ENABLED")
