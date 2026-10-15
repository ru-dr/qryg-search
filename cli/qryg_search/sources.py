# SPDX-License-Identifier: GPL-3.0-or-later
import re

from .paths import SEARCH_PROVIDER_DIRS, provider_id
from .settings import parse_variant, string_list
from .system import run
from .ui import CliError

GNOME_SEARCH = "org.gnome.desktop.search-providers"


def gnome_sources():
    found = {}
    for folder in SEARCH_PROVIDER_DIRS:
        for ini in sorted(folder.glob("*.ini")) if folder.exists() else []:
            match = re.search(r"^DesktopId=(.+)$", ini.read_text(errors="ignore"), re.M)
            if match:
                desktop = match.group(1).strip()
                found[desktop.removesuffix(".desktop").split(".")[-1].lower()] = desktop
    return found


def gnome_disabled():
    result = run("gsettings", "get", GNOME_SEARCH, "disabled")
    return set(parse_variant(result.stdout)) if result and result.returncode == 0 else set()


def set_gnome_disabled(values):
    result = run("gsettings", "set", GNOME_SEARCH, "disabled", string_list(sorted(values)))
    if result is None or result.returncode != 0:
        raise CliError(f"could not change GNOME's search settings: {result.stderr.strip() if result else 'gsettings is missing'}")


class SourceCatalog:
    def __init__(self, settings, plugins):
        self._settings = settings
        self._plugins = plugins

    def all(self):
        sources = {}
        for plugin_id, manifest in self._plugins.all().items():
            sources[plugin_id] = {"id": provider_id(plugin_id), "label": manifest.get("name", plugin_id), "manifest": manifest}
        sources["apps"] = {"id": "applications", "label": "Applications and system actions", "manifest": None}
        for alias, desktop in gnome_sources().items():
            key = alias if alias not in sources else desktop.removesuffix(".desktop").lower()
            sources[key] = {"id": desktop, "label": desktop.removesuffix(".desktop"), "manifest": None}
        return sources

    def state(self, source):
        if source["manifest"]:
            return "on" if self._plugins.is_enabled(source["manifest"]) else "off"
        if source["id"] in gnome_disabled():
            return "off (GNOME)"
        return "off" if source["id"] in self._settings.get("disabled-providers") else "on"

    def set_enabled(self, source, enabled):
        if source["manifest"]:
            self._plugins.set_enabled(source["manifest"], enabled)
            return False
        self._settings.set_in_list("disabled-providers", source["id"], not enabled)
        gnome = gnome_disabled()
        if enabled and source["id"] in gnome:
            set_gnome_disabled(gnome - {source["id"]})
            return True
        return False
