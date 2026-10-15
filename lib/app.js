// SPDX-License-Identifier: GPL-3.0-or-later
import * as Bookmarks from './core/bookmarks.js';
import {Config} from './core/config.js';
import {GlobalShortcut} from './core/shortcut.js';
import {StyleSheet} from './core/style.js';
import {ThemeWatcher} from './core/theme.js';
import {Launcher} from './launcher/launcher.js';
import {LauncherWindow} from './launcher/window.js';
import {SearchTakeover} from './overview/searchTakeover.js';
import {ThumbnailTweaks} from './overview/thumbnails.js';

export class App {
    constructor(gsettings) {
        this._config = new Config(gsettings);
    }

    enable() {
        const config = this._config;
        Bookmarks.watch();
        this._style = new StyleSheet(config);
        this._theme = new ThemeWatcher(config, () => this._window?.refreshTheme());
        this._takeover = new SearchTakeover({
            isOpen: () => this._window?.isOpen ?? false,
            onOverviewToggle: () => this._onOverviewToggle(),
            onActivate: () => this._window.close(),
        });
        this._thumbnails = new ThumbnailTweaks();
        this._shortcut = new GlobalShortcut(() => this.toggle());

        this._style.enable();
        this._theme.enable();
        this._takeover.enable();
        this._launcher = new Launcher({config, takeover: this._takeover, close: () => this._window.close()});
        this._launcher.enable();
        this._window = new LauncherWindow({config, theme: this._theme, launcher: this._launcher, takeover: this._takeover});
        this._thumbnails.enable();
        this._shortcut.enable(config.shortcut);
        config.onChanged(['toggle-shortcut'], () => this._shortcut.rebind(config.shortcut), this);
    }

    disable() {
        this._config.disconnect(this);
        this._shortcut.disable();
        this._thumbnails.disable();
        this._window.hideNow();
        this._launcher.disable();
        this._window.destroy();
        this._launcher.destroy();
        this._takeover.disable();
        this._theme.disable();
        this._style.disable();
        Bookmarks.unwatch();
        this._window = this._launcher = this._takeover = null;
        this._shortcut = this._thumbnails = this._theme = this._style = null;
    }

    toggle() {
        if (this._window.isOpen)
            this._window.closeAfterRelease();
        else
            this._window.open();
    }

    _onOverviewToggle() {
        if (!this._launcher.takeRecentSuperCombo())
            this._window.close();
    }
}
