# SPDX-License-Identifier: GPL-3.0-or-later
import json
import os
from pathlib import Path
import sys

from . import VERSION, remote
from .bookmarks import BookmarkStore, kind_of
from .doctor import run_doctor, shortcut_conflicts
from .install import install, uninstall
from .manifest import example_text, guide_problems, load as load_manifest, normalize_examples
from .paths import BOOKMARKS_FILE, EXTENSION_DIR, USER_PLUGINS, USER_STYLES, UUID
from .plugins import PluginCatalog, is_word_keyword
from .runner import resolve_settings, run_js, run_script
from .settings import Settings, quote
from .sources import SourceCatalog
from .styles import StyleStore
from .system import extension_state, is_active, run
from .ui import CliError, bad, bold, dim, fmt, ok, table, warn

COMMANDS = []
MODIFIER_WORDS = {"super": "<Super>", "ctrl": "<Control>", "control": "<Control>", "alt": "<Alt>", "shift": "<Shift>"}


def command(name, help_text, aliases=(), arguments=()):
    def register(function):
        COMMANDS.append({"name": name, "help": help_text, "aliases": list(aliases), "arguments": arguments, "run": function})
        return function
    return register


class Context:
    def __init__(self):
        self.settings = Settings()
        self.plugins = PluginCatalog(self.settings)
        self.sources = SourceCatalog(self.settings, self.plugins)
        self.styles = StyleStore(self.settings)
        self.bookmarks = BookmarkStore()

    def core_features(self):
        plugin_keys = self.plugins.plugin_keys()
        return [k for k in self.settings.keys if k.startswith("feature-") and k not in plugin_keys]


def _accelerator(text):
    if "<" in text:
        return text
    *modifiers, key = text.split("+")
    return "".join(MODIFIER_WORDS.get(m.lower(), "") for m in modifiers) + key.lower()


@command("status", "show install state and key settings")
def status(ctx, _args):
    print(bold(f"QryG Search {VERSION}"))
    state = extension_state(UUID)
    if state is None:
        if (EXTENSION_DIR / "metadata.json").exists():
            warn("installed, GNOME loads it at next login: log out and back in, then `qryg enable`")
        else:
            warn("not installed: run `qryg install`, then log out and back in")
        return
    link = f" -> {EXTENSION_DIR.resolve()}" if EXTENSION_DIR.is_symlink() else ""
    enabled = [m["id"] for m in ctx.plugins.all().values() if ctx.plugins.is_enabled(m)]
    print(f"  path      {EXTENSION_DIR}{link}")
    print(f"  state     {state}")
    print(f"  shortcut  {ctx.settings.get('toggle-shortcut')[0]}")
    print(f"  style     {ctx.settings.get('style') or 'built-in'}, theme {ctx.settings.get('theme-preference')}")
    print(f"  plugins   {len(enabled)} on: {', '.join(enabled)}")


@command("enable", "turn the extension on")
def enable(_ctx, _args):
    result = run("gnome-extensions", "enable", UUID)
    if result is None or result.returncode != 0:
        raise CliError("could not enable; after installing, log out and back in first")
    ok("enabled")


@command("disable", "turn the extension off")
def disable(_ctx, _args):
    result = run("gnome-extensions", "disable", UUID)
    if result is None or result.returncode != 0:
        raise CliError("could not disable")
    ok("disabled")


@command("doctor", "check dependencies, shortcut and prefix conflicts")
def doctor(ctx, _args):
    run_doctor(ctx.settings, ctx.plugins)


@command("prefs", "open the preferences window")
def prefs(_ctx, _args):
    result = run("gnome-extensions", "prefs", UUID)
    if result is None or result.returncode != 0:
        raise CliError("could not open preferences, is the extension loaded?")


@command("list", "show every setting", aliases=["config"])
def list_settings(ctx, _args):
    table([(key, fmt(ctx.settings.get(key)), meta["summary"]) for key, meta in ctx.settings.keys.items()])


@command("get", "print one setting", arguments=[("key", {})])
def get(ctx, args):
    print(fmt(ctx.settings.get(args.key)))


@command("set", "change one setting", arguments=[("key", {}), ("value", {"nargs": "+"})])
def set_setting(ctx, args):
    ok(f"{args.key} = {fmt(ctx.settings.set_text(args.key, ' '.join(args.value)))}")


@command("reset", "restore defaults", arguments=[("keys", {"nargs": "*"}), ("--all", {"action": "store_true"})])
def reset(ctx, args):
    keys = list(ctx.settings.keys) if args.all else args.keys
    if not keys:
        raise CliError("name a setting or pass --all")
    for key in keys:
        ctx.settings.reset(key)
        ok(f"{key} reset to {fmt(ctx.settings.get(key))}")


@command("feature", "list or toggle interface features",
         arguments=[("action", {"nargs": "?", "choices": ["list", "on", "off"]}), ("names", {"nargs": "*"})])
def feature(ctx, args):
    keys = ctx.core_features()
    names = [k.removeprefix("feature-") for k in keys]
    if args.action in (None, "list"):
        table([(n, fmt(ctx.settings.get(f"feature-{n}")), ctx.settings.keys[f"feature-{n}"]["summary"]) for n in names])
        return
    targets = names if args.names == ["all"] else args.names
    if not targets:
        raise CliError(f"name a feature: {', '.join(names)}")
    for name in targets:
        if name not in names:
            raise CliError(f"unknown feature {name}, choose from: {', '.join(names)}")
        ok(f"{name} = {fmt(ctx.settings.set_text(f'feature-{name}', args.action))}")


@command("theme", "show or set the theme", arguments=[("value", {"nargs": "?", "choices": ["default", "dark", "light"]})])
def theme(ctx, args):
    print(fmt(ctx.settings.set_text("theme-preference", args.value) if args.value else ctx.settings.get("theme-preference")))


@command("style", "list, use, create or remove custom CSS styles",
         arguments=[
             ("action", {"nargs": "?", "choices": ["list", "use", "off", "new", "rm", "remove", "path", "dir"]}),
             ("rest", {"nargs": "*"}),
         ])
def style(ctx, args):
    STYLE_ACTIONS[args.action or "list"](ctx, args)


def _style_name(args):
    if not args.rest:
        raise CliError("give a style name")
    return args.rest[0]


def _style_list(ctx, _args):
    active = ctx.styles.active()
    rows = [("built-in", "active" if not active else "", "the default look")]
    rows += [(name, "active" if name == active else "", str(ctx.styles.path(name))) for name in ctx.styles.names()]
    table(rows)
    print(dim("  create one: qryg style new NAME, then qryg style use NAME"))


def _style_use(ctx, args):
    name = _style_name(args)
    ctx.styles.use(name)
    ok(f"style {name}; edits to the file apply as you save")


def _style_off(ctx, _args):
    ctx.styles.off()
    ok("built-in style")


def _style_new(ctx, args):
    target = ctx.styles.create(_style_name(args), args.rest[1] if len(args.rest) > 1 else None)
    ok(f"created {target}")
    print(f"  apply it: qryg style use {target.stem}")


def _style_remove(ctx, args):
    name = _style_name(args)
    ctx.styles.remove(name)
    ok(f"removed {name}")


STYLE_ACTIONS = {
    "list": _style_list,
    "use": _style_use,
    "off": _style_off,
    "new": _style_new,
    "rm": _style_remove,
    "remove": _style_remove,
    "path": lambda ctx, args: print(ctx.styles.path(_style_name(args))),
    "dir": lambda _ctx, _args: print(USER_STYLES),
}


@command("accent", "show or set the accent colour, e.g. #ff375f", arguments=[("value", {"nargs": "?"})])
def accent(ctx, args):
    print(fmt(ctx.settings.set_text("accent-color", args.value) if args.value else ctx.settings.get("accent-color")))


@command("shortcut", "show or set the toggle shortcut, e.g. super+space", arguments=[("value", {"nargs": "?"})])
def shortcut(ctx, args):
    if not args.value:
        print(ctx.settings.get("toggle-shortcut")[0])
        return
    accelerator = _accelerator(args.value)
    ctx.settings.set_variant("toggle-shortcut", f"[{quote(accelerator)}]")
    ok(f"shortcut = {accelerator}")
    for where in shortcut_conflicts(accelerator):
        warn(f"also bound in {where}")


@command("source", "list or toggle search sources, e.g. contacts", aliases=["provider"],
         arguments=[("action", {"nargs": "?", "choices": ["list", "on", "off"]}), ("names", {"nargs": "*"})])
def source(ctx, args):
    sources = ctx.sources.all()
    if args.action in (None, "list"):
        table([(name, ctx.sources.state(s), s["label"]) for name, s in sources.items()])
        return
    targets = list(sources) if args.names == ["all"] else args.names
    if not targets:
        raise CliError(f"name a source: {', '.join(sources)}")
    for name in targets:
        if name not in sources:
            raise CliError(f"unknown source {name}, see `qryg source`")
        if ctx.sources.set_enabled(sources[name], args.action == "on"):
            warn(f"{name} was also off in GNOME Settings, turned that on too")
        ok(f"{name} {args.action}")


@command("keyword", "list prefixes, or set one: qryg keyword files find", aliases=["keywords"],
         arguments=[("plugin", {"nargs": "?"}), ("prefix", {"nargs": "?", "help": "a prefix, none, or default"})])
def keyword(ctx, args):
    if args.plugin is None:
        rows = []
        for manifest in sorted(ctx.plugins.all().values(), key=lambda m: m["id"]):
            prefix = ctx.plugins.keyword(manifest)
            usage = f"{prefix} query" if prefix and is_word_keyword(prefix) else f"{prefix}query" if prefix else "automatic"
            state = "" if ctx.plugins.is_enabled(manifest) else " (off)"
            rows.append((manifest["id"], prefix or "-", f"{usage}{state}"))
        table(rows)
        print(dim("  change one: qryg keyword PLUGIN PREFIX   (none removes it, default restores it)"))
        return
    manifest = ctx.plugins.get(args.plugin)
    if args.prefix is None:
        print(ctx.plugins.keyword(manifest) or "none")
        return
    ctx.plugins.set_keyword(manifest, args.prefix)
    ok(f"{manifest['id']} prefix = {ctx.plugins.keyword(manifest) or 'none'}")


@command("plugin", "list, enable, disable, install, remove, create, configure, validate or test plugins", aliases=["plugins"],
         arguments=[
             ("action", {"nargs": "?", "choices": ["list", "info", "enable", "disable", "install", "update", "remove", "new", "config", "reload", "dir", "validate", "test"]}),
             ("rest", {"nargs": "*"}),
             ("--type", {"choices": ["js", "script"], "default": "js"}),
             ("--lang", {"choices": ["python", "bash"], "default": "python"}),
             ("--link", {"action": "store_true", "help": "install: symlink a local folder"}),
             ("--activate", {"type": int, "metavar": "N", "help": "test: also show what Enter on result N does"}),
             (("-y", "--yes"), {"action": "store_true", "help": "install: do not ask for confirmation"}),
         ])
def plugin(ctx, args):
    action = args.action or "list"
    handler = PLUGIN_ACTIONS.get(action)
    handler(ctx, args)


def _plugin_list(ctx, _args):
    rows = []
    for plugin_id, m in sorted(ctx.plugins.all().items()):
        prefix = ctx.plugins.keyword(m) or "-"
        source = "bundled" if m["_bundled"] else "user"
        rows.append((plugin_id, fmt(ctx.plugins.is_enabled(m)), m.get("type", "?"), prefix, source, m.get("name", "")))
    table(rows)


def _require_id(args):
    if not args.rest:
        raise CliError(f"usage: qryg plugin {args.action} ID")
    return args.rest[0]


def _plugin_info(ctx, args):
    m = ctx.plugins.get(_require_id(args))
    print(bold(f"{m.get('name', m['id'])} {m.get('version', '')}") + f"  ({m['id']})")
    print(f"  {m.get('description', '')}")
    prefix = ctx.plugins.keyword(m)
    print(f"  prefix    {prefix or 'none'}")
    for key in ("type", "position", "category", "author", "api"):
        if m.get(key):
            print(f"  {key:<9} {m[key]}")
    if m.get("persistent"):
        print("  process   long-running")
    print(f"  enabled   {fmt(ctx.plugins.is_enabled(m))}")
    print(f"  folder    {m['_dir']}")
    if m.get("settings"):
        print("  settings")
        table([(d["key"], fmt(ctx.plugins.setting(m, d)), d.get("title", "")) for d in m["settings"]])
    _print_guide(m, prefix)


def _print_guide(manifest, prefix):
    examples = normalize_examples(manifest.get("examples"))
    if examples:
        print("  how to use")
        table([(example_text(prefix, e["query"]), e["description"]) for e in examples])
    if not prefix and manifest.get("keyword"):
        print(dim(f"  the prefix is off: `qryg keyword {manifest['id']} default` brings back {manifest['keyword']}"))
    for problem in guide_problems(manifest):
        warn(f"not loaded: {problem}")


def _plugin_toggle(ctx, args):
    m = ctx.plugins.get(_require_id(args))
    ctx.plugins.set_enabled(m, args.action == "enable")
    ok(f"{m['id']} {'on' if args.action == 'enable' else 'off'}")


def _plugin_config(ctx, args):
    m = ctx.plugins.get(_require_id(args))
    definitions = {d["key"]: d for d in m.get("settings", [])}
    if len(args.rest) == 1:
        _plugin_info(ctx, args)
        return
    definition = definitions.get(args.rest[1])
    if not definition:
        raise CliError(f"{m['id']} has no setting {args.rest[1]}; available: {', '.join(definitions) or 'none'}")
    if len(args.rest) == 2:
        print(fmt(ctx.plugins.setting(m, definition)))
        return
    value = ctx.plugins.set_setting(m, definition, " ".join(args.rest[2:]))
    ok(f"{m['id']}.{definition['key']} = {fmt(value)}")


def _plugin_new(ctx, args):
    target, manifest = ctx.plugins.create(_require_id(args), args.type, args.lang, os.environ.get("USER", ""))
    ok(f"created {target}")
    print(f"  edit {target / manifest['main']}, then: qryg plugin reload")
    if args.type == "js":
        print(dim("  run `qryg plugin reload` after editing; no logout needed"))


def _plugin_install(ctx, args):
    source = _require_id(args)
    if not args.yes and not sys.stdin.isatty():
        raise CliError("no terminal to confirm in; pass --yes to install without asking")
    installed = ctx.plugins.install(source, link=args.link, confirm=lambda *card: _confirm_install(args.yes, *card))
    if not installed:
        print(dim("  not installed"))
        return
    manifest, target, linked, reloaded = installed
    ok(f"installed {manifest['id']} to {target}" + (" (linked)" if linked else ""))
    if not reloaded:
        warn("could not reach QryG's settings; run `qryg plugin reload` once it is installed")


def _confirm_install(yes, manifest, spec, target, existing):
    for label, value in remote.card(manifest, spec["source"], target, existing):
        print(f"  {label.lower():<9} {bold(value) if label == 'Name' else value}")
    warn(remote.install_warning(spec["source"]))
    if yes:
        return True
    try:
        return input("Install? [y/N] ").strip().lower() in ("y", "yes")
    except EOFError:
        return False


def _plugin_update(ctx, args):
    if args.rest:
        targets = [ctx.plugins.get(plugin_id) for plugin_id in args.rest]
    else:
        targets = [m for m in ctx.plugins.all().values() if not m["_bundled"] and ctx.plugins.source_of(m)]
        if not targets:
            print(dim("  no installed plugins with a recorded source"))
            return
    for manifest in targets:
        try:
            before, after = ctx.plugins.update(manifest)
        except CliError as error:
            warn(str(error))
            continue
        ok(f"{manifest['id']} {before} -> {after}" if before != after else f"{manifest['id']} {after} is up to date")


def _plugin_remove(ctx, args):
    m = ctx.plugins.get(_require_id(args))
    ctx.plugins.remove(m)
    ok(f"removed {m['id']}")


def _plugin_reload(ctx, args):
    if args.rest:
        manifest = ctx.plugins.get(args.rest[0])
        ctx.plugins.reload(manifest["id"])
        ok(f"{manifest['id']} reloaded")
        return
    ctx.plugins.reload()
    ok("plugins reloaded")


def _plugin_folder(ctx, target):
    folder = Path(target).expanduser()
    if folder.name == "manifest.json":
        folder = folder.parent
    if folder.is_dir() and (os.sep in target or target.startswith(".") or (folder / "manifest.json").exists()):
        return folder.resolve(), False
    manifest = ctx.plugins.get(target)
    return manifest["_dir"], manifest["_bundled"]


def _plugin_validate(ctx, args):
    folder, bundled = _plugin_folder(ctx, _require_id(args))
    manifest, problems, warnings = load_manifest(folder, bundled)
    name = manifest["id"] if manifest and isinstance(manifest.get("id"), str) else folder.name
    for problem in problems:
        bad(problem)
    for warning in warnings:
        warn(warning)
    if problems:
        raise CliError(f"{name} would not load ({len(problems)} problem{'s' if len(problems) > 1 else ''})")
    ok(f"{name} is valid" + (f", with {len(warnings)} warning{'s' if len(warnings) > 1 else ''}" if warnings else ""))


def _plugin_test(ctx, args):
    if len(args.rest) < 1:
        raise CliError("usage: qryg plugin test ID|PATH QUERY [--activate N]")
    folder, bundled = _plugin_folder(ctx, args.rest[0])
    manifest, problems, _warnings = load_manifest(folder, bundled)
    if problems:
        raise CliError(f"not loaded: {'; '.join(problems)}")
    query = " ".join(args.rest[1:]).strip()
    prefix = ctx.plugins.keyword(manifest) if manifest["id"] in ctx.plugins.all() else manifest["keyword"]
    raw = f"{prefix}{' ' if is_word_keyword(prefix) else ''}{query}" if prefix else query
    catalog = ctx.plugins
    settings = resolve_settings(manifest, lambda definition: catalog.setting(manifest, definition))
    runner = run_js if manifest["type"] == "js" else run_script
    run = runner(manifest, query, settings, activate=args.activate, raw=raw)
    print(bold(f"{manifest['name']}") + dim(f"  {len(run.results)} result{'' if len(run.results) == 1 else 's'} in {run.ms} ms"))
    for number, result in enumerate(run.results, start=1):
        score = f"  score {result['score']}" if isinstance(result.get("score"), (int, float)) else ""
        print(f"  {number:>2}  {bold(result['title'])}{dim(score)}")
        if result.get("subtitle"):
            print(f"      {result['subtitle']}")
        details = {k: result[k] for k in ("copy", "activate", "path") if result.get(k) is not None}
        if result.get("actions"):
            details["actions"] = [a.get("id") for a in result["actions"] if isinstance(a, dict)]
        if details:
            print(dim(f"      {json.dumps(details, ensure_ascii=False)[:200]}"))
    if run.activation:
        print(bold(f"Enter on {args.activate}") + dim(f"  via {run.activation['via']}"))
        print(f"  would apply {json.dumps(run.activation['effects'], ensure_ascii=False)}")
        for name, value in run.activation.get("calls") or []:
            print(f"  called api.{name}({json.dumps(value, ensure_ascii=False)})")
    for line in run.logs:
        print(dim(f"  log: {line}"))
    if run.stderr.strip():
        print(dim("  stderr:"))
        for line in run.stderr.strip().splitlines()[-20:]:
            print(dim(f"    {line}"))


PLUGIN_ACTIONS = {
    "list": _plugin_list,
    "info": _plugin_info,
    "enable": _plugin_toggle,
    "disable": _plugin_toggle,
    "config": _plugin_config,
    "new": _plugin_new,
    "install": _plugin_install,
    "update": _plugin_update,
    "remove": _plugin_remove,
    "reload": _plugin_reload,
    "dir": lambda _ctx, _args: print(USER_PLUGINS),
    "validate": _plugin_validate,
    "test": _plugin_test,
}


@command("bookmark", "qryg bookmarks: list, add NAME TARGET, rm NAME", aliases=["bm"],
         arguments=[
             ("action", {"nargs": "?", "choices": ["list", "add", "rm", "remove", "path"]}),
             ("rest", {"nargs": "*"}),
             ("--type", {"choices": ["file", "folder", "site", "location", "command"]}),
             ("--tag", {"action": "append"}),
         ])
def bookmark(ctx, args):
    action = args.action or "list"
    if action == "list":
        items = ctx.bookmarks.load()
        if not items:
            print("  no bookmarks yet, add one: qryg bookmark add docs ~/Documents")
        table([(b["name"], b.get("type") or kind_of(b["target"]), b["target"]) for b in items])
    elif action == "add":
        if len(args.rest) < 2:
            raise CliError("usage: qryg bookmark add NAME TARGET   (a path, URL, sftp://… or '> command')")
        entry = ctx.bookmarks.add(args.rest[0], " ".join(args.rest[1:]), args.type, args.tag)
        ok(f"bookmarked {entry['name']} ({entry['type']}) -> {entry['target']}")
    elif action in ("rm", "remove"):
        if not args.rest:
            raise CliError("usage: qryg bookmark rm NAME")
        removed = ctx.bookmarks.remove(args.rest)
        ok(f"removed {', '.join(removed)}")
        for name in args.rest:
            if name not in removed:
                warn(f"no bookmark named {name}")
    else:
        print(BOOKMARKS_FILE)


@command("install", "install this checkout into GNOME Shell",
         arguments=[("--link", {"action": "store_true", "help": "symlink instead of copying, for development"})])
def install_command(_ctx, args):
    cli = install(link=args.link)
    ok(f"installed to {EXTENSION_DIR}" + (" (linked)" if args.link else ""))
    ok(f"cli linked at {cli}")
    print("  log out and back in to load it" + ("" if is_active(extension_state(UUID)) else ", then run: qryg enable"))


@command("uninstall", "remove the extension, keeping settings")
def uninstall_command(_ctx, _args):
    uninstall()
    ok("uninstalled; `qryg reset --all` before uninstalling clears settings")
