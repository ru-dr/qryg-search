# SPDX-License-Identifier: GPL-3.0-or-later
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "cli"))

from qryg_search.bookmarks import kind_of, normalize  # noqa: E402
from qryg_search.commands import _accelerator  # noqa: E402
from qryg_search.manifest import is_word_keyword  # noqa: E402
from qryg_search.settings import parse_variant, quote, string_list  # noqa: E402
from qryg_search.styles import StyleStore  # noqa: E402
from qryg_search.ui import CliError  # noqa: E402
from qryg_search.update import base_version_key, latest_release, version_key  # noqa: E402


class VariantTests(unittest.TestCase):
    def test_parse(self):
        self.assertIs(parse_variant("true"), True)
        self.assertEqual(parse_variant("42"), 42)
        self.assertEqual(parse_variant("'hello'"), "hello")
        self.assertEqual(parse_variant('"What\'s up"'), "What's up")
        self.assertEqual(parse_variant("@as []"), [])
        self.assertEqual(parse_variant("['a', \"b'c\"]"), ["a", "b'c"])

    def test_quote(self):
        self.assertEqual(quote("it's"), "'it\\'s'")
        self.assertEqual(string_list(["a", "b"]), "['a', 'b']")


class BookmarkPathTests(unittest.TestCase):
    def test_home_is_only_replaced_at_the_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp, "me")
            (home / "docs").mkdir(parents=True)
            sibling = Path(tmp, "me2")
            sibling.mkdir()
            with mock.patch.object(Path, "home", return_value=home):
                self.assertEqual(normalize(str(home / "docs")), "~/docs")
                self.assertEqual(normalize(str(sibling)), str(sibling.resolve()))


class UpdateTests(unittest.TestCase):
    def test_latest_release_skips_pre_releases(self):
        self.assertEqual(latest_release(["v1.0.0", "v1.10.0", "v1.9.2", "v2.0.0-rc1", "notes"]), "v1.10.0")
        self.assertIsNone(latest_release(["v2.0.0-rc1"]))

    def test_pre_release_compares_by_its_base(self):
        self.assertEqual(base_version_key("2.1.0-rc1"), (2, 1, 0))
        self.assertIsNone(version_key("2.1.0-rc1"))

    def test_version_key(self):
        self.assertEqual(version_key("1.2.3"), (1, 2, 3))
        self.assertEqual(version_key("v1.2.3"), (1, 2, 3))
        self.assertIsNone(version_key("1.2"))
        self.assertGreater(version_key("v1.10.0"), version_key("1.9.0"))


class HelperTests(unittest.TestCase):
    def test_accelerator(self):
        self.assertEqual(_accelerator("super+space"), "<Super>space")
        self.assertEqual(_accelerator("Ctrl+Alt+K"), "<Control><Alt>k")
        self.assertEqual(_accelerator("<Super>space"), "<Super>space")

    def test_keywords(self):
        self.assertTrue(is_word_keyword("f"))
        self.assertFalse(is_word_keyword(">"))

    def test_style_names(self):
        self.assertEqual(StyleStore.path("my-style").name, "my-style.css")
        with self.assertRaises(CliError):
            StyleStore.path("../evil")

    def test_bookmark_kinds(self):
        self.assertEqual(kind_of("> df -h"), "command")
        self.assertEqual(kind_of("https://github.com"), "site")
        self.assertEqual(kind_of("sftp://nas/home"), "location")
        self.assertEqual(kind_of("~"), "folder")


if __name__ == "__main__":
    unittest.main()
