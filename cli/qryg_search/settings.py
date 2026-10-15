# SPDX-License-Identifier: GPL-3.0-or-later
import json
import re
import xml.etree.ElementTree as ET
from functools import cached_property

from .paths import EXTENSION_DIR, REPO, SCHEMA
from .system import run
from .ui import CliError

TRUE_WORDS = {"on", "true", "yes", "1", "enable", "enabled"}
FALSE_WORDS = {"off", "false", "no", "0", "disable", "disabled"}


def quote(value):
    return "'" + str(value).replace("\\", "\\\\").replace("'", "\\'") + "'"


def string_list(values):
    return "[" + ", ".join(quote(v) for v in values) + "]"


def parse_variant(text):
    text = text.strip()
    if text.startswith("@as "):
        text = text[4:]
    if text in ("true", "false"):
        return text == "true"
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    if text.startswith("["):
        return [a or b for a, b in re.findall(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"", text)]
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "'\"":
        return text[1:-1].replace("\\'", "'").replace('\\"', '"')
    return text


class Settings:
    @cached_property
    def schema_dir(self):
        candidates = [EXTENSION_DIR / "schemas", REPO / "schemas"]
        for folder in candidates:
            if (folder / "gschemas.compiled").exists():
                return folder
        for folder in candidates:
            if folder.exists() and run("glib-compile-schemas", str(folder)) and (folder / "gschemas.compiled").exists():
                return folder
        raise CliError("schema not found, run `qryg install` first")

    @cached_property
    def keys(self):
        xml = next(self.schema_dir.glob("*.gschema.xml"))
        result = {}
        for key in ET.parse(xml).getroot().iter("key"):
            bounds = key.find("range")
            result[key.get("name")] = {
                "type": key.get("type"),
                "summary": (key.findtext("summary") or "").strip(),
                "choices": [c.get("value") for c in key.iter("choice")],
                "range": (int(bounds.get("min")), int(bounds.get("max"))) if bounds is not None else None,
            }
        return result

    def _gsettings(self, *args):
        result = run("gsettings", "--schemadir", str(self.schema_dir), *args)
        if result is None:
            raise CliError("gsettings not found")
        if result.returncode != 0:
            raise CliError(result.stderr.strip() or "gsettings failed")
        return result.stdout.strip()

    def require(self, key):
        if key not in self.keys:
            raise CliError(f"unknown setting {key}, see `qryg list`")
        return self.keys[key]

    def get(self, key):
        self.require(key)
        return parse_variant(self._gsettings("get", SCHEMA, key))

    def set_variant(self, key, variant):
        self.require(key)
        self._gsettings("set", SCHEMA, key, variant)

    def set_in_list(self, key, item, present):
        """Adds item to, or removes it from, a string list setting."""
        values = set(self.get(key))
        (values.add if present else values.discard)(item)
        self.set_variant(key, string_list(sorted(values)))

    def set_text(self, key, raw):
        self.set_variant(key, self.to_variant(key, raw))
        return self.get(key)

    def reset(self, key):
        self.require(key)
        self._gsettings("reset", SCHEMA, key)

    def get_json(self, key):
        try:
            value = json.loads(self.get(key) or "{}")
        except ValueError:
            return {}
        return value if isinstance(value, dict) else {}

    def set_json(self, key, value):
        self.set_variant(key, quote(json.dumps(value)))

    def to_variant(self, key, raw):
        meta = self.require(key)
        kind = meta["type"]
        if kind == "b":
            word = raw.lower()
            if word in TRUE_WORDS:
                return "true"
            if word in FALSE_WORDS:
                return "false"
            raise CliError(f"{key} expects on or off")
        if kind == "i":
            if not re.fullmatch(r"-?\d+", raw):
                raise CliError(f"{key} expects a whole number")
            number = int(raw)
            low, high = meta["range"] or (None, None)
            if low is not None and not low <= number <= high:
                raise CliError(f"{key} must be between {low} and {high}")
            return str(number)
        if kind == "s":
            if meta["choices"] and raw not in meta["choices"]:
                raise CliError(f"{key} must be one of: {', '.join(meta['choices'])}")
            if key == "accent-color" and not re.fullmatch(r"#[0-9a-fA-F]{6}", raw):
                raise CliError("accent-color expects #rrggbb, for example #0a84ff")
            return quote(raw)
        if kind == "as":
            return string_list(item.strip() for item in raw.split(",") if item.strip())
        raise CliError(f"unsupported type {kind}")

    def bump(self, key):
        self.set_variant(key, str(int(self.get(key)) + 1))
