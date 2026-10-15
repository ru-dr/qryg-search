#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
METADATA = ROOT / "metadata.json"
PACKAGE = ROOT / "package.json"
CLI_VERSION = ROOT / "cli" / "qryg_search" / "__init__.py"
CHANGELOG = ROOT / "CHANGELOG.md"
SEMVER = re.compile(r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$")
UNRELEASED = "## Unreleased"


def fail(message):
    sys.exit(f"release: {message}")


def versions():
    return {
        "metadata.json": json.loads(METADATA.read_text())["version-name"],
        "package.json": json.loads(PACKAGE.read_text())["version"],
        "cli/qryg_search/__init__.py": re.search(r'VERSION = "([^"]+)"', CLI_VERSION.read_text()).group(1),
    }


def section(version):
    text = CHANGELOG.read_text()
    match = re.search(rf"^## {re.escape(version)}\b.*?$\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1).strip() if match else None


def write_json(path, update):
    data = json.loads(path.read_text())
    update(data)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def bump(version):
    text = CHANGELOG.read_text()
    if UNRELEASED not in text:
        fail(f"CHANGELOG.md has no '{UNRELEASED}' section to release")
    if section(version) is not None:
        fail(f"CHANGELOG.md already has a {version} section")
    notes = text.split(UNRELEASED, 1)[1].split("\n## ", 1)[0].strip()
    if not notes:
        fail(f"the '{UNRELEASED}' section is empty")
    today = datetime.date.today().isoformat()
    CHANGELOG.write_text(text.replace(UNRELEASED, f"{UNRELEASED}\n\n## {version} - {today}", 1))

    write_json(METADATA, lambda data: data.update({"version-name": version}))
    write_json(PACKAGE, lambda data: data.update(version=version))
    CLI_VERSION.write_text(re.sub(r'VERSION = "[^"]+"', f'VERSION = "{version}"', CLI_VERSION.read_text()))
    print(f"bumped to {version}; commit, open a pull request, and tag v{version} after it merges")


def verify(version):
    found = versions()
    wrong = {name: value for name, value in found.items() if value != version}
    if wrong:
        fail(f"version {version} does not match: {wrong}")
    if not section(version):
        fail(f"CHANGELOG.md has no notes for {version}")
    print(f"{version} is consistent")


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("bump", "verify", "notes"):
        fail("usage: release.py bump|verify|notes VERSION")
    action, version = sys.argv[1], sys.argv[2].removeprefix("v")
    if not SEMVER.match(version):
        fail(f"{version} is not a semantic version such as 1.2.0")
    if action == "bump":
        bump(version)
    elif action == "verify":
        verify(version)
    else:
        notes = section(version)
        if notes is None:
            fail(f"CHANGELOG.md has no notes for {version}")
        print(notes)


if __name__ == "__main__":
    main()
