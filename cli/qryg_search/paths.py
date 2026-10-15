# SPDX-License-Identifier: GPL-3.0-or-later
import os
from pathlib import Path

UUID = "qryg-search@ru-dr"
APP = "qryg-search"
SCHEMA = f"org.gnome.shell.extensions.{APP}"
SETTINGS_PATH = f"/org/gnome/shell/extensions/{APP}/"
# Plugin search providers are registered as qryg-search-<plugin id>.
PROVIDER_PREFIX = f"{APP}-"
REPO = Path(__file__).resolve().parents[2]
CLI_SCRIPT = REPO / "bin" / "qryg"
DATA_HOME = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))
CONFIG_HOME = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
CACHE_HOME = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
APP_DATA = DATA_HOME / APP
APP_CONFIG = CONFIG_HOME / APP
APP_CACHE = CACHE_HOME / APP
EXTENSION_DIR = DATA_HOME / "gnome-shell" / "extensions" / UUID
USER_PLUGINS = APP_DATA / "plugins"
USER_STYLES = APP_CONFIG / "styles"
BOOKMARKS_FILE = APP_CONFIG / "bookmarks.json"
BIN_DIR = Path.home() / ".local" / "bin"
SEARCH_PROVIDER_DIRS = [Path("/usr/share/gnome-shell/search-providers"), DATA_HOME / "gnome-shell" / "search-providers"]


def provider_id(plugin_id):
    return f"{PROVIDER_PREFIX}{plugin_id}"


# Keep in step with the zip list in the Makefile.
EXTENSION_PAYLOAD = ["extension.js", "metadata.json", "prefs.js", "stylesheet.css", "LICENSE", "lib", "prefs", "schemas", "plugins"]
