# SPDX-License-Identifier: GPL-3.0-or-later
# `qryg update`: looks for a newer QryG in the git checkout the CLI runs from, as install.sh sets up.
import re

from . import VERSION
from .paths import REPO
from .system import git as run_git
from .ui import CliError

RELEASE_TAG = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
INSTALL_HINT = "curl -fsSL https://raw.githubusercontent.com/ru-dr/qryg-search/main/install.sh | bash"


def version_key(text):
    """(major, minor, patch) of a release like v1.2.3, or None for anything else, such as a pre-release."""
    match = RELEASE_TAG.match(text if text.startswith("v") else f"v{text}")
    return tuple(int(part) for part in match.groups()) if match else None


def base_version_key(text):
    """(major, minor, patch) with any pre-release part dropped, so 2.1.0-rc1 compares as 2.1.0."""
    return version_key(text.split("-", 1)[0])


def latest_release(tags):
    """The newest vX.Y.Z tag, skipping pre-releases like v1.2.0-rc1."""
    releases = [tag for tag in tags if version_key(tag)]
    return max(releases, key=version_key, default=None)


def git(*args):
    return run_git(*args, cwd=REPO)


def check():
    """Fetches from GitHub and returns what an update would do, without changing anything."""
    if not (REPO / ".git").exists():
        raise CliError(f"{REPO} is not a git checkout, so it can't update itself. Reinstall with:\n  {INSTALL_HINT}")
    git("fetch", "--quiet", "--tags", "--force", "origin")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch != "HEAD":
        if f"origin/{branch}" not in git("branch", "--remotes", "--format=%(refname:short)").split():
            raise CliError(f"{branch} is not on GitHub, so there is nothing to update it from")
        behind = int(git("rev-list", "--count", f"HEAD..origin/{branch}") or 0)
        return {"kind": "branch", "branch": branch, "behind": behind, "current": VERSION,
                "available": behind > 0, "target": f"origin/{branch}"}
    latest = latest_release(git("tag", "--list", "v*").split())
    current = base_version_key(VERSION)
    newer = bool(latest) and (current is None or version_key(latest) > current)
    return {"kind": "release", "current": VERSION, "latest": latest, "available": newer, "target": latest}


def apply(state):
    if git("status", "--porcelain", "--untracked-files=no"):
        raise CliError(f"{REPO} has local changes; commit or stash them first")
    if state["kind"] == "branch":
        git("merge", "--ff-only", "--quiet", state["target"])
    else:
        git("checkout", "--quiet", "--detach", state["target"])
