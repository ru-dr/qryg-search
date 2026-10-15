# SPDX-License-Identifier: GPL-3.0-or-later
# `qryg update`: looks for a newer QryG in the git checkout the CLI runs from, as install.sh sets up.
import re

from . import VERSION
from .paths import REPO
from .system import run
from .ui import CliError

RELEASE_TAG = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
INSTALL_HINT = "curl -fsSL https://raw.githubusercontent.com/ru-dr/qryg-search/main/install.sh | bash"


def version_key(text):
    match = RELEASE_TAG.match(text if text.startswith("v") else f"v{text}")
    return tuple(int(part) for part in match.groups()) if match else None


def latest_release(tags):
    """The newest vX.Y.Z tag, skipping pre-releases like v1.2.0-rc1."""
    releases = [tag for tag in tags if version_key(tag)]
    return max(releases, key=version_key, default=None)


def git(*args):
    result = run("git", "-C", str(REPO), *args)
    if result is None:
        raise CliError("git is not installed")
    if result.returncode != 0:
        raise CliError(f"git {args[0]} failed: {(result.stderr or result.stdout).strip()}")
    return result.stdout.strip()


def check():
    """Fetches from GitHub and returns what an update would do, without changing anything."""
    if not (REPO / ".git").exists():
        raise CliError(f"{REPO} is not a git checkout, so it can't update itself. Reinstall with:\n  {INSTALL_HINT}")
    git("fetch", "--quiet", "--tags", "--force", "origin")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch != "HEAD":
        if run("git", "-C", str(REPO), "rev-parse", "--verify", "--quiet", f"origin/{branch}").returncode != 0:
            raise CliError(f"{branch} is not on GitHub, so there is nothing to update it from")
        behind = int(git("rev-list", "--count", f"HEAD..origin/{branch}") or 0)
        return {"kind": "branch", "branch": branch, "behind": behind, "current": VERSION,
                "available": behind > 0, "target": f"origin/{branch}"}
    latest = latest_release(git("tag", "--list", "v*").split())
    newer = bool(latest) and version_key(latest) > version_key(VERSION)
    return {"kind": "release", "current": VERSION, "latest": latest, "available": newer, "target": latest}


def apply(state):
    if git("status", "--porcelain", "--untracked-files=no"):
        raise CliError(f"{REPO} has local changes; commit or stash them first")
    if state["kind"] == "branch":
        git("merge", "--ff-only", "--quiet", state["target"])
    else:
        git("checkout", "--quiet", "--detach", state["target"])
