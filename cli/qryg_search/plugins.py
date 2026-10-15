# SPDX-License-Identifier: GPL-3.0-or-later
import json
import re
import shutil
import tempfile
import time
from pathlib import Path

from . import remote
from .paths import EXTENSION_DIR, REPO, USER_PLUGINS
from .settings import FALSE_WORDS, TRUE_WORDS, quote, string_list
from .ui import CliError

API_VERSION = 1
SOURCE_FILE = ".qryg-search-source.json"
PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
KEYWORD = re.compile(r"^\S{1,12}$")

SCAFFOLD_JS = """// SPDX-License-Identifier: GPL-3.0-or-later
export default class Plugin {
    constructor(api) {
        this.api = api;
    }

    query({query}) {
        if (!query)
            return [];
        return [{
            title: `You typed: ${query}`,
            subtitle: 'Enter copies it',
            icon: 'face-smile-symbolic',
            copy: query,
            activate: {copy: query},
        }];
    }
}
"""

SCAFFOLD_PYTHON = """#!/usr/bin/env python3
import json
import sys


def query(request):
    text = request.get("query", "")
    if not text:
        return {"results": []}
    return {"results": [{
        "title": f"You typed: {text}",
        "subtitle": "Enter copies it",
        "icon": "face-smile-symbolic",
        "copy": text,
        "activate": {"copy": text},
    }]}


def activate(request):
    return {}


METHODS = {"query": query, "activate": activate}


def serve():
    for line in sys.stdin:
        request = json.loads(line)
        reply = METHODS.get(request.get("method"), lambda _r: {})(request)
        print(json.dumps({"id": request.get("id"), **reply}), flush=True)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "query"
    if mode == "serve":
        serve()
    else:
        request = json.loads(sys.stdin.readline() or "{}")
        print(json.dumps(METHODS.get(mode, lambda _r: {})(request)))
"""

SCAFFOLD_BASH = """#!/usr/bin/env bash
read -r request
query=$(printf '%s' "$request" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("query", ""))')
if [ -z "$query" ]; then
    echo '{"results": []}'
    exit 0
fi
python3 -c 'import json, sys; q = sys.argv[1]; print(json.dumps({"results": [{"title": "You typed: " + q, "copy": q, "activate": {"copy": q}}]}))' "$query"
"""


def is_word_keyword(keyword):
    return bool(keyword) and keyword[0].isalnum()


class PluginCatalog:
    def __init__(self, settings):
        self._settings = settings

    @staticmethod
    def bundled_dir():
        for folder in (EXTENSION_DIR / "plugins", REPO / "plugins"):
            if folder.is_dir():
                return folder
        return None

    @staticmethod
    def read_manifest(folder):
        try:
            manifest = json.loads((folder / "manifest.json").read_text())
        except (OSError, ValueError):
            return None
        if not isinstance(manifest, dict) or not PLUGIN_ID.match(str(manifest.get("id", ""))):
            return None
        manifest["_dir"] = folder
        return manifest

    def all(self):
        found = {}
        for base, bundled in ((self.bundled_dir(), True), (USER_PLUGINS, False)):
            if not base or not base.is_dir():
                continue
            for folder in sorted(base.iterdir()):
                manifest = self.read_manifest(folder) if folder.is_dir() else None
                if manifest:
                    manifest["_bundled"] = bundled
                    found[manifest["id"]] = manifest
        return found

    def get(self, plugin_id):
        manifest = self.all().get(plugin_id)
        if not manifest:
            raise CliError(f"unknown plugin {plugin_id}, see `qryg-search plugin list`")
        return manifest

    def plugin_keys(self):
        keys = set()
        for manifest in self.all().values():
            if manifest.get("toggle"):
                keys.add(manifest["toggle"])
            keys.update(s["gsetting"] for s in manifest.get("settings", []) if s.get("gsetting"))
        return keys

    def is_enabled(self, manifest):
        if f"qryg-search-{manifest['id']}" in self._settings.get("disabled-providers"):
            return False
        toggle = manifest.get("toggle")
        return bool(self._settings.get(toggle)) if toggle else True

    def set_enabled(self, manifest, enabled):
        disabled = set(self._settings.get("disabled-providers"))
        provider_id = f"qryg-search-{manifest['id']}"
        if enabled:
            disabled.discard(provider_id)
            if manifest.get("toggle"):
                self._settings.set_variant(manifest["toggle"], "true")
        else:
            disabled.add(provider_id)
        self._settings.set_variant("disabled-providers", string_list(sorted(disabled)))

    def keyword(self, manifest):
        custom = self._settings.get_json("keywords")
        if manifest["id"] in custom:
            return custom[manifest["id"]] or None
        return manifest.get("keyword") or None

    def set_keyword(self, manifest, value):
        custom = self._settings.get_json("keywords")
        if value == "default":
            custom.pop(manifest["id"], None)
        elif value in ("none", ""):
            custom[manifest["id"]] = ""
        elif KEYWORD.match(value):
            custom[manifest["id"]] = value
        else:
            raise CliError("a prefix is 1 to 12 characters without spaces, or `none`, or `default`")
        self._settings.set_json("keywords", custom)

    def setting(self, manifest, definition):
        if definition.get("gsetting"):
            return self._settings.get(definition["gsetting"])
        stored = self._settings.get_json("plugin-settings").get(manifest["id"], {})
        return stored.get(definition["key"], definition.get("default"))

    def set_setting(self, manifest, definition, raw):
        if definition.get("gsetting"):
            return self._settings.set_text(definition["gsetting"], raw)
        kind = definition["type"]
        if kind == "bool":
            if raw.lower() not in TRUE_WORDS | FALSE_WORDS:
                raise CliError(f"{definition['key']} expects on or off")
            value = raw.lower() in TRUE_WORDS
        elif kind == "int":
            if not re.fullmatch(r"-?\d+", raw):
                raise CliError(f"{definition['key']} expects a whole number")
            value = int(raw)
            low, high = definition.get("min"), definition.get("max")
            if (low is not None and value < low) or (high is not None and value > high):
                raise CliError(f"{definition['key']} must be {describe_range(low, high)}")
        elif kind == "strings":
            value = [item.strip() for item in raw.split(",") if item.strip()]
        elif kind == "choice":
            if raw not in definition.get("choices", []):
                raise CliError(f"{definition['key']} must be one of: {', '.join(definition.get('choices', []))}")
            value = raw
        else:
            value = raw
        store = self._settings.get_json("plugin-settings")
        store.setdefault(manifest["id"], {})[definition["key"]] = value
        self._settings.set_json("plugin-settings", store)
        return value

    def reload(self, plugin_id=None):
        if plugin_id:
            self._settings.set_variant("plugins-reload-id", quote(f"{plugin_id}#{time.time_ns()}"))
        else:
            self._settings.bump("plugins-reload")

    def create(self, plugin_id, kind, language, author):
        if not PLUGIN_ID.match(plugin_id):
            raise CliError("plugin ids use lowercase letters, digits and dashes")
        target = USER_PLUGINS / plugin_id
        if target.exists():
            raise CliError(f"{target} already exists")
        target.mkdir(parents=True)
        manifest = {
            "id": plugin_id, "name": plugin_id.replace("-", " ").title(), "description": "Describe what it does.",
            "version": "0.1.0", "author": author, "api": 1, "type": kind, "keyword": plugin_id.split("-")[0],
            "position": "bottom", "priority": 50, "category": "general", "icon": "application-x-addon-symbolic",
            "settings": [],
        }
        if kind == "js":
            manifest["main"] = "plugin.js"
            (target / "plugin.js").write_text(SCAFFOLD_JS)
        else:
            manifest["main"] = "plugin.py" if language == "python" else "plugin.sh"
            script = target / manifest["main"]
            script.write_text(SCAFFOLD_PYTHON if language == "python" else SCAFFOLD_BASH)
            script.chmod(0o755)
        (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        self.reload()
        return target, manifest

    def install(self, source, link=False, confirm=None):
        spec = remote.classify(source)
        with tempfile.TemporaryDirectory() as tmp:
            folder = remote.fetch(spec, Path(tmp))
            manifest = remote.check(folder, API_VERSION)
            target = USER_PLUGINS / manifest["id"]
            if folder == target.resolve() or target.resolve() in folder.parents:
                raise CliError(f"{folder} is already installed here; edit it in place, then `qryg-search plugin reload`")
            link = link and spec["kind"] == "folder"
            existing = self.read_manifest(target) if target.exists() else None
            if confirm and not confirm(manifest, spec, target, existing):
                return None
            record = {"source": source if remote.is_url(source) else str(Path(source).expanduser().resolve()),
                      "kind": spec["kind"], "ref": spec["ref"]}
            remote.replace_dir(folder, target, link, {SOURCE_FILE: json.dumps(record) + "\n"})
        return manifest, target, link, self.try_reload()

    def try_reload(self):
        try:
            self.reload()
        except CliError:
            return False
        return True

    @staticmethod
    def source_of(manifest):
        folder = manifest["_dir"]
        if folder.is_symlink():
            return None
        try:
            return json.loads((folder / SOURCE_FILE).read_text()).get("source")
        except (OSError, ValueError, AttributeError):
            return None

    def update(self, manifest):
        if manifest["_bundled"]:
            raise CliError(f"{manifest['id']} is bundled; it updates with QryG")
        if manifest["_dir"].is_symlink():
            raise CliError(f"{manifest['id']} is linked to {manifest['_dir'].resolve()}; it is always up to date")
        source = self.source_of(manifest)
        if not source:
            raise CliError(f"{manifest['id']} has no recorded source; reinstall it with `qryg-search plugin install`")
        before = manifest.get("version", "")
        updated, *_rest = self.install(source)
        return before, updated.get("version", "")

    def remove(self, manifest):
        if manifest["_bundled"]:
            raise CliError(f"{manifest['id']} is bundled with QryG; disable it instead: qryg-search plugin disable {manifest['id']}")
        remove_path(manifest["_dir"])
        self.reload()


def describe_range(low, high):
    if low is not None and high is not None:
        return f"between {low} and {high}"
    return f"at least {low}" if low is not None else f"at most {high}"


def remove_path(path):
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)
