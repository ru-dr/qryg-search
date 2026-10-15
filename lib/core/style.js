// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {LOOK_KEYS} from './config.js';
import {buildCss, scopeUserCss} from './css.js';
import {readStyle, stylePath} from './userStyles.js';

const STYLE_FILE = GLib.build_filenamev([GLib.get_user_cache_dir(), 'qryg-search', 'custom.css']);

export class StyleSheet {
    constructor(config) {
        this._config = config;
        this._file = Gio.File.new_for_path(STYLE_FILE);
        this._theme = null;
        this._monitor = null;
    }

    enable() {
        this._context.connectObject('changed', () => {
            if (this._context.get_theme() !== this._theme)
                this._load();
        }, this);
        this._config.onChanged(LOOK_KEYS, () => this._load(), this);
        this._config.onChanged(['style'], () => this._watch(), this);
        this._watch();
    }

    disable() {
        this._config.disconnect(this);
        this._unwatch();
        this._context.disconnectObject(this);
        this._unload();
    }

    get _context() {
        return St.ThemeContext.get_for_stage(global.stage);
    }

    _watch() {
        this._unwatch();
        const path = stylePath(this._config.style);
        if (path) {
            this._monitor = Gio.File.new_for_path(path).monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connectObject('changed', (_m, _f, _o, event) => {
                if (event === Gio.FileMonitorEvent.CHANGES_DONE_HINT || event === Gio.FileMonitorEvent.CREATED ||
                    event === Gio.FileMonitorEvent.DELETED)
                    this._load();
            }, this);
        }
        this._load();
    }

    _unwatch() {
        this._monitor?.disconnectObject(this);
        this._monitor?.cancel();
        this._monitor = null;
    }

    _css() {
        const user = readStyle(this._config.style);
        return user ? `${buildCss(this._config)}\n${scopeUserCss(user)}\n` : buildCss(this._config);
    }

    _load() {
        this._unload();
        GLib.mkdir_with_parents(GLib.path_get_dirname(STYLE_FILE), 0o755);
        this._file.replace_contents(new TextEncoder().encode(this._css()),
            null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        this._theme = this._context.get_theme();
        this._theme.load_stylesheet(this._file);
    }

    _unload() {
        this._theme?.unload_stylesheet(this._file);
        this._theme = null;
    }
}
