# SPDX-License-Identifier: GPL-3.0-or-later
import json
import os
import re

API_VERSION = 1
PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
KEYWORD = re.compile(r"^\S{1,12}$")
POSITIONS = ["top", "after-apps", "bottom"]
CATEGORIES = ["general", "apps", "files", "actions", "clipboard"]
SETTING_TYPES = ["bool", "int", "string", "strings", "choice"]
KNOWN_KEYS = {
    "id", "name", "description", "version", "author", "api", "type", "main", "command", "keyword", "global",
    "position", "priority", "category", "icon", "minQueryLength", "completion", "timeout", "startupTimeout",
    "persistent", "settings", "toggle",
}
SETTING_KEYS = {"key", "type", "default", "title", "description", "min", "max", "choices", "gsetting"}


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def has_command(manifest):
    return isinstance(manifest.get("command"), list) and len(manifest["command"]) > 0


def clamp(value, low, high, default):
    return min(high, max(low, value)) if is_int(value) else default


def _check_setting(index, setting, warnings):
    if not isinstance(setting, dict) or not isinstance(setting.get("key"), str) or setting.get("type") not in SETTING_TYPES:
        warnings.append(f"settings[{index}] is ignored: it needs a \"key\" and a \"type\" of {', '.join(SETTING_TYPES)}")
        return False
    key, kind, default = setting["key"], setting["type"], setting.get("default")
    for extra in sorted(set(setting) - SETTING_KEYS):
        warnings.append(f"setting {key}: unknown field \"{extra}\"")
    if setting.get("gsetting"):
        return True
    if kind == "int":
        low, high = setting.get("min"), setting.get("max")
        if is_int(low) and is_int(high) and low > high:
            warnings.append(f"setting {key}: min is larger than max")
        if default is not None and (not is_int(default) or (is_int(low) and default < low) or (is_int(high) and default > high)):
            warnings.append(f"setting {key}: default {default!r} is not a whole number within min and max")
    elif kind == "bool" and default is not None and not isinstance(default, bool):
        warnings.append(f"setting {key}: default should be true or false")
    elif kind == "choice":
        choices = setting.get("choices")
        if not isinstance(choices, list) or not choices:
            warnings.append(f"setting {key}: a choice setting needs a non-empty \"choices\" list")
        elif default is not None and default not in choices:
            warnings.append(f"setting {key}: default {default!r} is not one of the choices")
    elif kind == "strings" and default is not None and not isinstance(default, list):
        warnings.append(f"setting {key}: default should be a list of strings")
    elif kind == "string" and default is not None and not isinstance(default, str):
        warnings.append(f"setting {key}: default should be a string")
    return True


# Mirrors validate() in lib/plugins/manifest.js, and also warns about values it silently replaces.
def validate(raw, folder, bundled=False):
    problems, warnings = [], []
    m = dict(raw)
    kind = m.get("type")
    if not isinstance(m.get("id"), str) or not PLUGIN_ID.match(m["id"]):
        problems.append("id must be lowercase letters, digits and dashes")
    if not isinstance(m.get("name"), str) or not m["name"].strip():
        problems.append("name is required")
    if kind not in ("js", "script"):
        problems.append('type must be "js" or "script"')
    if kind == "js" and (not isinstance(m.get("main"), str) or not m["main"].endswith(".js")):
        problems.append('js plugins need "main": "plugin.js"')
    if kind == "script" and not has_command(m) and not isinstance(m.get("main"), str):
        problems.append('script plugins need "main" (an executable) or "command" (an argv array)')
    api = m.get("api")
    if api is not None and not (is_int(api) and api >= 1):
        problems.append("api must be a whole number, such as 1")
    elif is_int(api) and api > API_VERSION:
        problems.append(f"needs plugin API {api}, this QryG supports {API_VERSION}; update QryG")
    keyword = m.get("keyword")
    if keyword is not None and not (isinstance(keyword, str) and KEYWORD.match(keyword)):
        problems.append('keyword must be 1 to 12 characters without spaces, such as ">" or "calc"')

    for key in sorted(set(m) - KNOWN_KEYS):
        warnings.append(f"unknown field \"{key}\" is ignored")
    for key, allowed, default in (("position", POSITIONS, "bottom"), ("category", CATEGORIES, "general")):
        if key in m and m[key] not in allowed:
            warnings.append(f"{key} {m[key]!r} is not one of {', '.join(allowed)}; using \"{default}\"")
    for key in ("priority", "minQueryLength"):
        if key in m and not is_int(m[key]):
            warnings.append(f"{key} must be a whole number; using the default")
    for key, low, high in (("timeout", 100, 10000), ("startupTimeout", 0, 30000)):
        if key in m and not is_int(m[key]):
            warnings.append(f"{key} must be a whole number of milliseconds; using the default")
        elif key in m and not low <= m[key] <= high:
            warnings.append(f"{key} {m[key]} is outside {low} to {high}; using {clamp(m[key], low, high, 0)}")
    for key in ("global", "completion", "persistent"):
        if key in m and not isinstance(m[key], bool):
            warnings.append(f"{key} must be true or false")
    for key in ("icon", "description", "version"):
        if key in m and not isinstance(m[key], str):
            warnings.append(f"{key} must be a string; using the default")
    if kind != "script":
        for key in ("persistent", "command", "startupTimeout"):
            if key in m:
                warnings.append(f"{key} only applies to script plugins")
    elif "startupTimeout" in m and m.get("persistent") is not True:
        warnings.append("startupTimeout only applies to persistent script plugins")
    if "settings" in m and not isinstance(m["settings"], list):
        warnings.append("settings must be a list; ignoring it")
    settings = m.get("settings") if isinstance(m.get("settings"), list) else []
    kept = [s for i, s in enumerate(settings) if _check_setting(i, s, warnings)]

    m["keyword"] = keyword or None
    m["position"] = m.get("position") if m.get("position") in POSITIONS else "bottom"
    m["priority"] = m["priority"] if is_int(m.get("priority")) else 50
    m["category"] = m.get("category") if m.get("category") in CATEGORIES else "general"
    m["global"] = m.get("global") is not False
    m["completion"] = m.get("completion") is not False
    m["persistent"] = kind == "script" and m.get("persistent") is True
    m["api"] = api if is_int(api) else API_VERSION
    m["minQueryLength"] = max(0, m["minQueryLength"]) if is_int(m.get("minQueryLength")) else 1
    m["timeout"] = clamp(m.get("timeout"), 100, 10000, 1500)
    m["startupTimeout"] = clamp(m.get("startupTimeout"), 0, 30000, 5000)
    m["icon"] = m["icon"] if isinstance(m.get("icon"), str) else "application-x-addon-symbolic"
    m["description"] = m["description"] if isinstance(m.get("description"), str) else ""
    m["version"] = m["version"] if isinstance(m.get("version"), str) else "0.0.0"
    m["settings"] = kept
    m["dir"] = str(folder)
    m["bundled"] = bundled

    main = m.get("main")
    if kind == "js" and isinstance(main, str) and main and not os.path.exists(os.path.join(folder, main)):
        problems.append(f"{main} not found")
    if kind == "script" and not has_command(m) and isinstance(main, str) and main:
        exe = os.path.join(folder, main)
        if not (os.path.isfile(exe) and os.access(exe, os.X_OK)):
            problems.append(f"{main} is missing or not executable (chmod +x)")
    return m, problems, warnings


def load(folder, bundled=False):
    try:
        raw = json.loads((folder / "manifest.json").read_text())
    except OSError as error:
        return None, [f"manifest.json: {error.strerror or error}"], []
    except ValueError as error:
        return None, [f"manifest.json: {error}"], []
    if not isinstance(raw, dict):
        return None, ["manifest.json must contain a JSON object"], []
    return validate(raw, folder, bundled)
