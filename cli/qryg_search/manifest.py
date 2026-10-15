# SPDX-License-Identifier: GPL-3.0-or-later
# What a manifest must hold. lib/plugins/rules.js and lib/plugins/guide.js do the same for the extension: keep them in step.
import json
import os
import re

from .ui import CliError

API_VERSION = 1
MAX_EXAMPLES = 10
MAX_KEYWORD = 12
PLUGIN_ID = re.compile(r"[a-z0-9][a-z0-9-]{0,40}")
KEYWORD = re.compile(rf"\S{{1,{MAX_KEYWORD}}}")
POSITIONS = ["top", "after-apps", "bottom"]
CATEGORIES = ["general", "apps", "files", "actions", "clipboard"]
SETTING_TYPES = ["bool", "int", "string", "strings", "choice"]
KNOWN_KEYS = {
    "id", "name", "description", "version", "author", "api", "type", "main", "command", "keyword", "global",
    "position", "priority", "category", "icon", "minQueryLength", "completion", "timeout", "startupTimeout",
    "persistent", "settings", "toggle", "examples", "files",
}
SETTING_KEYS = {"key", "type", "default", "title", "description", "min", "max", "choices", "gsetting"}


def is_word_keyword(keyword):
    return bool(keyword) and keyword[0].isalnum()


def example_text(keyword, query):
    """What to type for an example, with the prefix the user has now."""
    query = query.strip()
    if not keyword:
        return query
    return f"{keyword} {query}".rstrip() if is_word_keyword(keyword) else f"{keyword}{query}"


def _number(text):
    value = float(text)
    return int(value) if value.is_integer() else value


def loads(text):
    """Parses JSON like JavaScript does, so 1.0 is the whole number 1."""
    return json.loads(text, parse_float=_number)


# Mirrors guideProblems() in lib/plugins/guide.js: every plugin needs a prefix and a usage guide.
def guide_problems(manifest):
    found = []
    keyword = manifest.get("keyword")
    if keyword is None or keyword == "":
        found.append('keyword is required: the prefix that limits the search to this plugin, such as "wx"')
    elif not (isinstance(keyword, str) and KEYWORD.fullmatch(keyword)):
        found.append('keyword must be 1 to 12 characters without spaces, such as ">" or "calc"')
    examples = manifest.get("examples")
    if not isinstance(examples, list) or not examples:
        found.append('examples is required: a list of ["what to type", "what it does"] pairs, '
                     'such as [["paris", "The weather in Paris"]]')
        return found
    if len(examples) > MAX_EXAMPLES:
        found.append(f"examples can have at most {MAX_EXAMPLES} entries")
    for index, example in enumerate(examples):
        if not _is_pair(example):
            found.append(f'examples[{index}] must be a pair of texts: ["what to type after the prefix", "what it does"]')
    return found


def _is_pair(example):
    return (isinstance(example, list) and len(example) == 2 and isinstance(example[0], str)
            and isinstance(example[1], str) and bool(example[1].strip()))


def normalize_examples(examples):
    kept = [e for e in examples if _is_pair(e)] if isinstance(examples, list) else []
    return [{"query": query.strip(), "description": description.strip()} for query, description in kept[:MAX_EXAMPLES]]


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def has_command(manifest):
    return isinstance(manifest.get("command"), list) and len(manifest["command"]) > 0


def clamp(value, low, high, default):
    return min(high, max(low, value)) if is_int(value) else default


def safe_relative(path, what="path"):
    if not isinstance(path, str) or not path or path.startswith("/") or "\\" in path:
        raise CliError(f"{what} {json.dumps(path)} must be a relative path inside the plugin")
    parts = [part for part in path.split("/") if part not in ("", ".")]
    if not parts or ".." in parts:
        raise CliError(f"{what} {json.dumps(path)} must be a relative path inside the plugin")
    return "/".join(parts)


def manifest_files(manifest):
    files = manifest.get("files", [])
    if not isinstance(files, list):
        raise CliError('"files" must be a list of relative paths')
    wanted = [manifest["main"]] if isinstance(manifest.get("main"), str) else []
    result = []
    for path in wanted + files:
        clean = safe_relative(path, "file")
        if clean != "manifest.json" and clean not in result:
            result.append(clean)
    return result


# Mirrors manifestProblems() in lib/plugins/rules.js. has_file(path, executable) says whether the plugin has that file.
def manifest_problems(manifest, has_file, api_version=API_VERSION):
    if not isinstance(manifest, dict):
        return ["manifest.json must be a JSON object"]
    found = []
    if not (isinstance(manifest.get("id"), str) and PLUGIN_ID.fullmatch(manifest["id"])):
        found.append("id must be lowercase letters, digits and dashes")
    if not isinstance(manifest.get("name"), str) or not manifest["name"].strip():
        found.append("name is required")
    kind, main = manifest.get("type"), manifest.get("main")
    if kind not in ("js", "script"):
        found.append('type must be "js" or "script"')
    elif kind == "js" and not (isinstance(main, str) and main.endswith(".js")):
        found.append('js plugins need "main": "plugin.js"')
    elif kind == "js" and not has_file(main, False):
        found.append(f"{main} not found")
    elif kind == "script" and not has_command(manifest):
        if not isinstance(main, str):
            found.append('script plugins need "main" (an executable) or "command" (an argv array)')
        elif not has_file(main, True):
            found.append(f"{main} is missing or not executable (chmod +x)")
    api = manifest.get("api")
    api = api_version if api is None else api
    if not is_int(api) or api < 1:
        found.append("api must be a whole number, such as 1")
    elif api > api_version:
        found.append(f"needs plugin API {api}, this QryG supports {api_version}; update QryG first")
    found.extend(guide_problems(manifest))
    try:
        manifest_files(manifest)
    except CliError as error:
        found.append(str(error))
    return found


def has_file_in(folder):
    def has_file(path, executable):
        file = os.path.join(folder, path)
        return os.path.isfile(file) and (not executable or os.access(file, os.X_OK))
    return has_file


def _check_setting(index, setting, warnings, bundled):
    if not isinstance(setting, dict) or not isinstance(setting.get("key"), str) or setting.get("type") not in SETTING_TYPES:
        warnings.append(f"settings[{index}] is ignored: it needs a \"key\" and a \"type\" of {', '.join(SETTING_TYPES)}")
        return False
    key, kind, default = setting["key"], setting["type"], setting.get("default")
    for extra in sorted(set(setting) - SETTING_KEYS):
        warnings.append(f"setting {key}: unknown field \"{extra}\"")
    if setting.get("gsetting") and bundled:
        return True
    if setting.get("gsetting"):
        warnings.append(f"setting {key}: gsetting only works in bundled plugins; it is kept with the plugin's settings")
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


# Mirrors scan() in lib/plugins/manifest.js: manifestProblems() and normalizeManifest() in lib/plugins/rules.js.
# It also warns about values it silently replaces.
def validate(raw, folder, bundled=False):
    problems = manifest_problems(raw, has_file_in(folder), API_VERSION)
    warnings = []
    m = dict(raw)
    kind = m.get("type")
    api = m.get("api")

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
    if "toggle" in m and not bundled:
        warnings.append("toggle only works in bundled plugins; it is ignored")
        del m["toggle"]
    settings = m.get("settings") if isinstance(m.get("settings"), list) else []
    kept = [s if bundled else {k: v for k, v in s.items() if k != "gsetting"}
            for i, s in enumerate(settings) if _check_setting(i, s, warnings, bundled)]

    m["keyword"] = m.get("keyword") or None
    m["examples"] = normalize_examples(m.get("examples"))
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
    return m, problems, warnings


def load(folder, bundled=False):
    try:
        raw = loads((folder / "manifest.json").read_text())
    except OSError as error:
        return None, [f"manifest.json: {error.strerror or error}"], []
    except ValueError as error:
        return None, [f"manifest.json: {error}"], []
    if not isinstance(raw, dict):
        return None, ["manifest.json must contain a JSON object"], []
    return validate(raw, folder, bundled)
