# SPDX-License-Identifier: GPL-3.0-or-later
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "cli"))

from qryg_search import bookmarks, main as cli_main, runner  # noqa: E402
from qryg_search.manifest import example_text, guide_problems, load, loads, validate  # noqa: E402
from qryg_search.plugins import PluginCatalog  # noqa: E402
from qryg_search.ui import CliError  # noqa: E402

REPO = Path(__file__).resolve().parent.parent

ONE_SHOT = """#!/usr/bin/env python3
import json, os, sys
request = json.loads(sys.stdin.readline())
if sys.argv[1] == "query":
    q = request["query"]
    if q == "slow":
        import time; time.sleep(2)
    print(json.dumps({"results": [
        {"title": q.upper(), "copy": q, "score": 90},
        {"title": "env", "subtitle": os.environ["QRYG_SEARCH_PLUGIN_ID"] + " " + os.getcwd(),
         "copy": str(os.path.isdir(os.environ["QRYG_SEARCH_CACHE_DIR"]))},
        {"title": "settings", "copy": json.dumps(request["settings"])},
        {"title": ""},
    ]}))
else:
    print("{}")
"""

SERVER = """#!/usr/bin/env python3
import json, sys, time
time.sleep(0.3)
print(json.dumps({"method": "log", "message": "starting"}), flush=True)
print(json.dumps({"method": "ready"}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    if request["method"] == "query":
        reply = {"results": [{"title": "served " + request["query"], "path": "~/notes.txt"}]}
    else:
        print(json.dumps({"method": "error", "message": "activate is not supported"}), flush=True)
        reply = {}
    print(json.dumps({"id": request["id"], **reply}), flush=True)
"""


class FakeSettings:
    def __init__(self):
        self.store = {}

    def get_json(self, key):
        return json.loads(json.dumps(self.store.get(key, {})))

    def set_json(self, key, value):
        self.store[key] = value


def make_plugin(base, script, **fields):
    folder = Path(base) / fields.get("id", "demo")
    folder.mkdir()
    (folder / "plugin.py").write_text(script)
    (folder / "plugin.py").chmod(0o755)
    manifest = {"id": "demo", "name": "Demo", "type": "script", "main": "plugin.py", "keyword": "demo",
                "examples": [["x", "Demo"]], **fields}
    (folder / "manifest.json").write_text(json.dumps(manifest))
    return folder


class ValidateTests(unittest.TestCase):
    def test_bundled_plugins_are_valid(self):
        for folder in sorted((REPO / "plugins").iterdir()):
            _manifest, problems, warnings = load(folder, bundled=True)
            self.assertEqual(problems, [], folder.name)
            self.assertEqual(warnings, [], folder.name)

    def test_prefix_and_examples_are_required(self):
        base = {"id": "x", "name": "X", "type": "js", "main": "plugin.js"}
        examples = [["paris", "Weather in Paris"]]
        self.assertEqual(guide_problems({**base, "keyword": "wx", "examples": examples}), [])
        self.assertTrue(any("keyword is required" in p for p in guide_problems({**base, "examples": examples})))
        self.assertTrue(any("examples is required" in p for p in guide_problems({**base, "keyword": "wx"})))
        self.assertTrue(any("must be a pair" in p
                            for p in guide_problems({**base, "keyword": "wx", "examples": [["x"]]})))
        self.assertTrue(any("must be a pair" in p
                            for p in guide_problems({**base, "keyword": "wx", "examples": [["x", " "]]})))
        _m, problems, _w = validate(base, "/nonexistent")
        self.assertTrue(any("keyword is required" in p for p in problems))

    def test_example_text(self):
        self.assertEqual(example_text("tz", "tokyo"), "tz tokyo")
        self.assertEqual(example_text("tz", ""), "tz")
        self.assertEqual(example_text(":", "fire"), ":fire")
        self.assertEqual(example_text(None, "tokyo"), "tokyo")

    def test_problems_match_the_extension(self):
        _m, problems, _w = validate({"id": "Bad Id", "type": "python"}, "/nonexistent")
        self.assertIn("id must be lowercase letters, digits and dashes", problems)
        self.assertIn("name is required", problems)
        self.assertIn('type must be "js" or "script"', problems)
        _m, problems, _w = validate({"id": "x", "name": "X", "type": "script", "command": []}, "/nonexistent")
        self.assertIn('script plugins need "main" (an executable) or "command" (an argv array)', problems)
        _m, problems, _w = validate({"id": "x", "name": "X", "type": "js", "main": "plugin.js", "api": 2}, "/nonexistent")
        self.assertTrue(any("needs plugin API 2" in p for p in problems))

    def test_empty_command_still_checks_main(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "plugin.py").write_text("")
            raw = {"id": "x", "name": "X", "type": "script", "main": "plugin.py", "command": []}
            _m, problems, _w = validate(raw, tmp)
            self.assertIn("plugin.py is missing or not executable (chmod +x)", problems)

    def test_warnings_for_defaulted_values(self):
        raw = {"id": "x", "name": "X", "type": "js", "main": "plugin.js", "position": "middle", "timeout": 50,
               "colour": "red", "persistent": True,
               "settings": [{"key": "n", "type": "int", "min": 1, "max": 3, "default": 9}, {"key": "bad", "type": "float"}]}
        manifest, _problems, warnings = validate(raw, "/nonexistent")
        text = "\n".join(warnings)
        for fragment in ('unknown field "colour"', "position 'middle'", "timeout 50 is outside", "persistent only applies",
                         "setting n: default 9", "settings[1] is ignored"):
            self.assertIn(fragment, text)
        self.assertEqual(manifest["position"], "bottom")
        self.assertEqual(manifest["timeout"], 100)
        self.assertEqual([s["key"] for s in manifest["settings"]], ["n"])

    def test_only_bundled_plugins_use_qryg_settings(self):
        raw = {"id": "x", "name": "X", "type": "js", "main": "plugin.js", "toggle": "feature-x",
               "settings": [{"key": "k", "type": "string", "gsetting": "terminal"}]}
        manifest, _problems, warnings = validate(raw, "/nonexistent")
        self.assertNotIn("toggle", manifest)
        self.assertNotIn("gsetting", manifest["settings"][0])
        self.assertTrue(any("toggle only works in bundled plugins" in w for w in warnings))
        self.assertTrue(any("gsetting only works in bundled plugins" in w for w in warnings))
        manifest, _problems, warnings = validate(raw, "/nonexistent", bundled=True)
        self.assertEqual(manifest["toggle"], "feature-x")
        self.assertEqual(manifest["settings"][0]["gsetting"], "terminal")

    def test_load_checks_paths_and_numbers_like_the_extension(self):
        raw = {"id": "x", "name": "X", "type": "js", "main": "plugin.js", "keyword": "x", "examples": [["a", "A"]],
               "files": ["../secret"], "api": None}
        _m, problems, _w = validate(raw, "/nonexistent")
        self.assertIn("plugin.js not found", problems)
        self.assertTrue(any("must be a relative path" in p for p in problems))
        self.assertFalse(any("api" in p for p in problems))
        parsed = loads('{"api": 1.0, "priority": 2.5, "timeout": 1e3}')
        self.assertEqual(parsed, {"api": 1, "priority": 2.5, "timeout": 1000})
        self.assertIsInstance(parsed["api"], int)

    def test_unreadable_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "manifest.json").write_text("{nope")
            manifest, problems, _w = load(Path(tmp))
            self.assertIsNone(manifest)
            self.assertTrue(problems[0].startswith("manifest.json:"))


class SettingTests(unittest.TestCase):
    def setUp(self):
        self.settings = FakeSettings()
        self.catalog = PluginCatalog(self.settings)
        self.manifest = {"id": "weather"}

    def test_int_range(self):
        days = {"key": "days", "type": "int", "min": 1, "max": 7}
        self.assertEqual(self.catalog.set_setting(self.manifest, days, "7"), 7)
        with self.assertRaisesRegex(CliError, "between 1 and 7"):
            self.catalog.set_setting(self.manifest, days, "8")
        with self.assertRaisesRegex(CliError, "at least 0"):
            self.catalog.set_setting(self.manifest, {"key": "n", "type": "int", "min": 0}, "-1")
        self.assertEqual(self.settings.store["plugin-settings"], {"weather": {"days": 7}})

    def test_keyword_falls_back_like_the_extension(self):
        manifest = {"id": "weather", "keyword": "wx"}
        self.assertEqual(self.catalog.keyword(manifest), "wx")
        for stored, expect in (("w", "w"), ("", None), ("two words", "wx"), (5, "wx")):
            self.settings.store["keywords"] = {"weather": stored}
            self.assertEqual(self.catalog.keyword(manifest), expect, stored)

    def test_bool_words(self):
        alerts = {"key": "alerts", "type": "bool"}
        self.assertIs(self.catalog.set_setting(self.manifest, alerts, "Enabled"), True)
        self.assertIs(self.catalog.set_setting(self.manifest, alerts, "off"), False)
        with self.assertRaisesRegex(CliError, "on or off"):
            self.catalog.set_setting(self.manifest, alerts, "maybe")

    def test_coerce_matches_the_extension(self):
        days = {"key": "days", "type": "int", "min": 1, "max": 7, "default": 3}
        self.assertEqual(runner.coerce(days, 9), 3)
        self.assertEqual(runner.coerce(days, True), 3)
        self.assertEqual(runner.coerce({"type": "choice", "choices": ["a", "b"]}, "c"), "a")
        manifest = {"settings": [days, {"key": "tone", "type": "string", "default": "none"}]}
        self.assertEqual(runner.resolve_settings(manifest), {"days": 3, "tone": "none"})


class BookmarkTests(unittest.TestCase):
    def test_remove_reports_what_was_removed(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(bookmarks, "BOOKMARKS_FILE", Path(tmp, "b.json")):
            store = bookmarks.BookmarkStore()
            store.save([{"name": "docs", "target": "~"}, {"name": "web", "target": "https://example.com"}])
            self.assertEqual(store.remove(["docs", "missing"]), ["docs"])
            self.assertEqual([b["name"] for b in store.load()], ["web"])
            with self.assertRaises(CliError):
                store.remove(["missing"])


class MainTests(unittest.TestCase):
    def test_errors_become_exit_codes(self):
        with mock.patch.object(cli_main, "Context", side_effect=OSError("disk full")), \
                mock.patch("builtins.print"):
            self.assertEqual(cli_main.main(["status"]), 1)
        with mock.patch.object(cli_main, "Context", side_effect=KeyboardInterrupt):
            self.assertEqual(cli_main.main(["status"]), 130)


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.env = mock.patch.dict(os.environ, {"XDG_CACHE_HOME": f"{self.tmp}/cache"})
        self.env.start()
        self.dirs = mock.patch.multiple(runner, APP_CACHE=Path(self.tmp, "cache", "qryg-search"),
                                        APP_CONFIG=Path(self.tmp, "config", "qryg-search"))
        self.dirs.start()

    def tearDown(self):
        self.dirs.stop()
        self.env.stop()
        shutil.rmtree(self.tmp)

    def manifest(self, script, **fields):
        manifest, problems, _w = load(make_plugin(self.tmp, script, **fields))
        self.assertEqual(problems, [])
        return manifest

    def test_one_shot_query(self):
        manifest = self.manifest(ONE_SHOT, settings=[{"key": "tone", "type": "string", "default": "none"}])
        run = runner.run_script(manifest, "fire", runner.resolve_settings(manifest), activate=1)
        self.assertEqual([r["title"] for r in run.results], ["FIRE", "env", "settings"])
        self.assertEqual(run.results[1]["subtitle"], f"demo {manifest['dir']}")
        self.assertEqual(run.results[1]["copy"], "True")
        self.assertEqual(json.loads(run.results[2]["copy"]), {"tone": "none"})
        self.assertEqual(run.activation, {"via": "the copy fallback", "effects": {"copy": "fire"}})
        self.assertTrue(Path(self.tmp, "config", "qryg-search", "plugins", "demo").is_dir())

    def test_timeout(self):
        manifest = self.manifest(ONE_SHOT, timeout=300)
        with self.assertRaisesRegex(CliError, "timed out after 300 ms"):
            runner.run_script(manifest, "slow", {})

    def test_persistent_server(self):
        manifest = self.manifest(SERVER, persistent=True, timeout=100, startupTimeout=3000)
        run = runner.run_script(manifest, "notes", {}, activate=1)
        self.assertEqual(run.results[0]["title"], "served notes")
        self.assertEqual(run.activation["effects"], {"copy": "~/notes.txt"})
        self.assertIn("log: starting", run.logs)
        self.assertIn("error: activate is not supported", run.logs)

    def test_persistent_startup_needs_time(self):
        manifest = self.manifest(SERVER, persistent=True, timeout=100, startupTimeout=0)
        with self.assertRaisesRegex(CliError, "timed out"):
            runner.run_script(manifest, "notes", {})

    def test_activate_number_is_checked(self):
        manifest = self.manifest(ONE_SHOT)
        with self.assertRaisesRegex(CliError, "from 1 to 3"):
            runner.run_script(manifest, "x", {}, activate=4)

    @unittest.skipUnless(shutil.which("gjs"), "needs gjs")
    def test_js_harness(self):
        manifest, problems, _w = load(REPO / "plugins" / "calc", bundled=True)
        self.assertEqual(problems, [])
        run = runner.run_js(manifest, "2+3", runner.resolve_settings(manifest), activate=1)
        self.assertEqual(run.results[0]["title"], "5")
        self.assertEqual(run.activation["effects"], {"copy": "5"})


if __name__ == "__main__":
    unittest.main()
