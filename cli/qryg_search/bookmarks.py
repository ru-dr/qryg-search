# SPDX-License-Identifier: GPL-3.0-or-later
import json
import re
from pathlib import Path

from .paths import BOOKMARKS_FILE
from .ui import CliError

URI = re.compile(r"^[a-z][a-z0-9+.-]*://", re.I)
SITE = re.compile(r"^(www\.)?[\w-]+(\.[\w-]+)+(/\S*)?$")


def kind_of(target):
    if target.startswith(">"):
        return "command"
    if re.match(r"^https?://", target, re.I) or (SITE.match(target) and not Path(target).expanduser().exists()):
        return "site"
    if URI.match(target) and not target.startswith("file://"):
        return "location"
    return "folder" if Path(target.removeprefix("file://")).expanduser().is_dir() else "file"


def normalize(target):
    if target.startswith(">") or URI.match(target):
        return target
    path = Path(target).expanduser()
    return str(path.resolve()).replace(str(Path.home()), "~", 1) if path.exists() else target


class BookmarkStore:
    def load(self):
        try:
            data = json.loads(BOOKMARKS_FILE.read_text())
        except (OSError, ValueError):
            return []
        return data if isinstance(data, list) else []

    def save(self, items):
        BOOKMARKS_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = BOOKMARKS_FILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n")
        temporary.replace(BOOKMARKS_FILE)

    def add(self, name, target, kind=None, tags=None):
        target = normalize(target)
        entry = {"name": name, "target": target, "type": kind or kind_of(target)}
        if tags:
            entry["tags"] = tags
        self.save([b for b in self.load() if b.get("name") != name] + [entry])
        return entry

    def remove(self, names):
        items = self.load()
        kept = [b for b in items if b.get("name") not in names]
        if len(kept) == len(items):
            raise CliError("no bookmark with that name")
        self.save(kept)
