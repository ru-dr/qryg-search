# SPDX-License-Identifier: GPL-3.0-or-later
import functools
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import threading
import unittest
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "cli"))

from qryg_search import plugins, remote  # noqa: E402
from qryg_search.ui import CliError  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "install"
CASES = json.loads((FIXTURES / "cases.json").read_text())
GREET = FIXTURES / "greet"
HAS_GIT = shutil.which("git") is not None


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def serve(folder):
    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(folder)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def add_tar(bundle, name, data=b"", kind=tarfile.REGTYPE, link="", mode=0o644):
    info = tarfile.TarInfo(name)
    info.type, info.linkname, info.mode, info.size = kind, link, mode, len(data)
    bundle.addfile(info, io.BytesIO(data) if kind == tarfile.REGTYPE else None)


def make_tar(path, entries):
    with tarfile.open(path, "w:gz") as bundle:
        for entry in entries:
            add_tar(bundle, *entry)
    return path


def git(*args, cwd=None):
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args], cwd=cwd,
                   check=True, capture_output=True)


def make_repo(folder, layout):
    folder.mkdir(parents=True)
    git("init", "-q", "-b", "main", str(folder))
    for path in layout:
        shutil.copytree(GREET, folder / path if path else folder, dirs_exist_ok=True)
        if path:
            manifest = json.loads((folder / path / "manifest.json").read_text())
            manifest["id"] = Path(path).name
            (folder / path / "manifest.json").write_text(json.dumps(manifest))
    git("add", "-A", cwd=folder)
    git("commit", "-qm", "init", cwd=folder)
    return f"file://{folder}"


class FakeSettings:
    def __init__(self):
        self.bumps = 0

    def bump(self, _key):
        self.bumps += 1


class SharedCaseTests(unittest.TestCase):
    def test_classify(self):
        for case in CASES["classify"]:
            with self.subTest(source=case["source"]):
                if case.get("error"):
                    with self.assertRaises(CliError):
                        remote.classify(case["source"])
                    continue
                spec = remote.classify(case["source"])
                self.assertEqual({k: spec[k] for k in case["expect"]}, case["expect"])

    def test_manifest_files(self):
        for case in CASES["files"]:
            with self.subTest(manifest=case["manifest"]):
                if case.get("error"):
                    with self.assertRaises(CliError):
                        remote.manifest_files(case["manifest"])
                else:
                    self.assertEqual(remote.manifest_files(case["manifest"]), case["expect"])

    def test_file_urls(self):
        for case in CASES["urls"]:
            self.assertEqual(remote.file_url(case["base"], case["path"]), case["expect"])

    def test_subfolder_urls(self):
        for case in CASES["subfolders"]:
            self.assertEqual(remote.subfolder_url(case["source"], case["path"]), case["expect"])

    def test_manifest_problems(self):
        for case in CASES["manifests"]:
            with self.subTest(manifest=case["manifest"]):
                def has_file(path, executable, files=case["files"]):
                    return path in files and (files[path] or not executable)
                self.assertEqual(not remote.problems(case["manifest"], has_file, 1), case["ok"])


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.out = self.tmp / "out"
        self.out.mkdir()

    def assertRejected(self, entries):
        archive = make_tar(self.tmp / "a.tar.gz", entries)
        with self.assertRaises(CliError):
            remote.extract(archive, self.out)
        self.assertFalse((self.tmp / "evil").exists())

    def test_traversal(self):
        self.assertRejected([("../evil", b"x")])
        self.assertRejected([("ok/../../evil", b"x")])

    def test_absolute_path(self):
        self.assertRejected([(str(self.tmp / "evil"), b"x")])

    def test_links_outside(self):
        self.assertRejected([("link", b"", tarfile.SYMTYPE, "../evil")])
        self.assertRejected([("link", b"", tarfile.SYMTYPE, str(self.tmp))])
        self.assertRejected([("d", b"", tarfile.SYMTYPE, "."), ("d/e", b"", tarfile.SYMTYPE, ".."), ("d/e/evil", b"x")])
        self.assertRejected([("hard", b"", tarfile.LNKTYPE, "../evil")])

    def test_oversize(self):
        with mock.patch.object(remote, "MAX_BYTES", 100):
            self.assertRejected([("big", b"x" * 101)])

    def test_zip_traversal(self):
        archive = self.tmp / "a.zip"
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("../evil", "x")
        with self.assertRaises(CliError):
            remote.extract(archive, self.out)

    def test_good_archive(self):
        archive = make_tar(self.tmp / "a.tar.gz", [
            ("./", b"", tarfile.DIRTYPE), ("greet-main/", b"", tarfile.DIRTYPE),
            ("greet-main/manifest.json", (GREET / "manifest.json").read_bytes()),
            ("greet-main/plugin.py", (GREET / "plugin.py").read_bytes(), tarfile.REGTYPE, "", 0o755),
            ("greet-main/lib/greeting.py", (GREET / "lib/greeting.py").read_bytes()),
            ("greet-main/latest", b"", tarfile.SYMTYPE, "plugin.py"),
        ])
        remote.extract(archive, self.out)
        folder = remote.locate(self.out, remote.classify("https://example.com/greet.tar.gz"))
        self.assertEqual(folder.name, "greet-main")
        self.assertTrue(os.access(folder / "plugin.py", os.X_OK))
        self.assertEqual(remote.check(folder, 1)["id"], "greet")


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        root = self.tmp / "www"
        shutil.copytree(GREET, root / "greet")
        with tarfile.open(root / "greet.tar.gz", "w:gz") as bundle:
            bundle.add(GREET, arcname="greet-1.0.0")
        self.server, self.url = serve(root)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def fetch(self, source):
        work = Path(tempfile.mkdtemp(dir=self.tmp))
        return remote.fetch(remote.classify(source), work)

    def test_manifest_url(self):
        folder = self.fetch(f"{self.url}/greet/manifest.json")
        self.assertEqual(sorted(p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file()),
                         ["lib/greeting.py", "manifest.json", "plugin.py"])
        self.assertTrue(os.access(folder / "plugin.py", os.X_OK))
        self.assertEqual(remote.check(folder, 1)["id"], "greet")

    def test_manifest_url_missing_file(self):
        with self.assertRaises(CliError):
            self.fetch(f"{self.url}/missing/manifest.json")

    def test_archive_url(self):
        folder = self.fetch(f"{self.url}/greet.tar.gz")
        self.assertEqual(folder.name, "greet-1.0.0")
        self.assertEqual(remote.check(folder, 1)["id"], "greet")

    def test_archive_download_cap(self):
        with mock.patch.object(remote, "MAX_BYTES", 100), self.assertRaises(CliError):
            self.fetch(f"{self.url}/greet.tar.gz")


@unittest.skipUnless(HAS_GIT, "git is not installed")
class GitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def fetch(self, source):
        work = Path(tempfile.mkdtemp(dir=self.tmp))
        return remote.fetch(remote.classify(source), work)

    def test_plugin_at_root(self):
        folder = self.fetch(make_repo(self.tmp / "single", [""]))
        self.assertEqual(remote.check(folder, 1)["id"], "greet")

    def test_one_plugin_folder(self):
        folder = self.fetch(make_repo(self.tmp / "one", ["weather"]))
        self.assertEqual(folder.name, "weather")

    def test_several_plugins(self):
        repo = make_repo(self.tmp / "many", ["plugins/alpha", "plugins/beta"])
        with self.assertRaises(CliError) as caught:
            self.fetch(repo)
        self.assertIn("plugins/alpha, plugins/beta", str(caught.exception))
        self.assertIn(f"{repo}/tree/HEAD/plugins/alpha", str(caught.exception))
        folder = self.fetch(f"{repo}/tree/main/plugins/beta")
        self.assertEqual(folder.name, "beta")
        self.assertFalse((folder.parent / "alpha").exists())

    def test_missing_subfolder(self):
        repo = make_repo(self.tmp / "repo", ["plugins/alpha"])
        with self.assertRaises(CliError):
            self.fetch(f"{repo}/tree/main/plugins/nope")


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.user = self.tmp / "data" / "plugins"
        patcher = mock.patch.object(plugins, "USER_PLUGINS", self.user)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.settings = FakeSettings()
        self.catalog = plugins.PluginCatalog(self.settings)
        self.source = self.tmp / "src"
        shutil.copytree(GREET, self.source)

    def installed(self):
        return self.catalog.all()["greet"]

    def record(self):
        return json.loads((self.user / "greet" / plugins.SOURCE_FILE).read_text())

    def bump_version(self, version):
        manifest = json.loads((self.source / "manifest.json").read_text())
        manifest["version"] = version
        (self.source / "manifest.json").write_text(json.dumps(manifest))

    def test_install_and_update(self):
        manifest, target, linked, reloaded = self.catalog.install(str(self.source))
        self.assertEqual((manifest["id"], target, linked, reloaded), ("greet", self.user / "greet", False, True))
        self.assertEqual(self.record(), {"source": str(self.source), "kind": "folder", "ref": None})
        self.bump_version("1.1.0")
        self.assertEqual(self.catalog.update(self.installed()), ("1.0.0", "1.1.0"))
        self.assertEqual(self.settings.bumps, 2)

    def test_update_old_source_file(self):
        self.catalog.install(str(self.source))
        (self.user / "greet" / plugins.SOURCE_FILE).write_text(json.dumps({"source": str(self.source)}))
        self.bump_version("2.0.0")
        self.assertEqual(self.catalog.update(self.installed()), ("1.0.0", "2.0.0"))
        self.assertEqual(self.record()["kind"], "folder")

    @unittest.skipUnless(HAS_GIT, "git is not installed")
    def test_update_from_subfolder_url(self):
        repo = make_repo(self.tmp / "repo", ["plugins/greet", "plugins/other"])
        url = f"{repo}/tree/main/plugins/greet"
        self.catalog.install(url)
        self.assertEqual(self.record(), {"source": url, "kind": "subdir", "ref": "main"})
        self.assertEqual(self.catalog.update(self.installed()), ("1.0.0", "1.0.0"))

    def test_install_from_target_keeps_it(self):
        self.catalog.install(str(self.source))
        with self.assertRaises(CliError):
            self.catalog.install(str(self.user / "greet"))
        self.assertTrue((self.user / "greet" / "manifest.json").exists())

    def test_failed_copy_keeps_old_plugin(self):
        self.catalog.install(str(self.source))
        self.bump_version("9.0.0")
        with mock.patch.object(remote.shutil, "copytree", side_effect=OSError("disk full")), self.assertRaises(CliError):
            self.catalog.install(str(self.source))
        self.assertEqual(self.installed()["version"], "1.0.0")
        self.assertEqual([p.name for p in self.user.parent.iterdir()], ["plugins"])

    def test_install_without_settings(self):
        self.settings.bump = mock.Mock(side_effect=CliError("gsettings not found"))
        *_rest, reloaded = self.catalog.install(str(self.source))
        self.assertFalse(reloaded)
        self.assertTrue((self.user / "greet" / "plugin.py").exists())

    def test_declined(self):
        self.assertIsNone(self.catalog.install(str(self.source), confirm=lambda *_card: False))
        self.assertFalse((self.user / "greet").exists())

    def test_card(self):
        manifest = remote.check(GREET, 1)
        rows = dict(remote.card(manifest, "https://example.com/greet.zip", self.user / "greet", None))
        self.assertEqual(rows["ID"], "greet")
        self.assertIn("runs as your user", rows["Type"])
        rows = dict(remote.card(manifest, "x", self.user / "greet", {"id": "greet", "name": "Greet", "version": "0.9"}))
        self.assertEqual(rows["Replaces"], "the installed Greet 0.9")


if __name__ == "__main__":
    unittest.main()
