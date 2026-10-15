# SPDX-License-Identifier: GPL-3.0-or-later
import re
import shutil
from pathlib import Path

from .paths import REPO, USER_STYLES
from .ui import CliError

STYLE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$")
TEMPLATE = REPO / "examples" / "styles" / "graphite.css"


class StyleStore:
    def __init__(self, settings):
        self._settings = settings

    @staticmethod
    def path(name):
        if not STYLE_NAME.match(name):
            raise CliError("style names use letters, digits, dashes and underscores")
        return USER_STYLES / f"{name}.css"

    def names(self):
        if not USER_STYLES.is_dir():
            return []
        return sorted(p.stem for p in USER_STYLES.glob("*.css") if STYLE_NAME.match(p.stem))

    def active(self):
        return self._settings.get("style")

    def use(self, name):
        if not self.path(name).exists():
            raise CliError(f"no style {name}; create it with `qryg style new {name}`")
        self._settings.set_text("style", name)

    def off(self):
        self._settings.set_text("style", "")

    def create(self, name, source=None):
        target = self.path(name)
        if target.exists():
            raise CliError(f"{target} already exists")
        origin = Path(source).expanduser() if source else TEMPLATE
        if not origin.is_file():
            raise CliError(f"{origin} is not a file")
        USER_STYLES.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origin, target)
        return target

    def remove(self, name):
        target = self.path(name)
        if not target.exists():
            raise CliError(f"no style {name}")
        if self.active() == name:
            self.off()
        target.unlink()
