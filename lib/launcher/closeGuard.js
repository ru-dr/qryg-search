// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import {SourceTracker} from '../core/sources.js';

const ACTIVATION_KEYS = [Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_space];

function isPopupMenu(actor) {
    return actor?.has_style_class_name?.('popup-menu') ?? false;
}

export class CloseGuard {
    constructor(close, stepBack) {
        this._close = close;
        this._stepBack = stepBack;
        this._sources = new SourceTracker();
    }

    install({window, entry, results}) {
        this._window = window;
        this._entry = entry;
        results.connectObject('button-press-event', () => {
            this._sources.idle('click-close', () => this._close());
            return Clutter.EVENT_PROPAGATE;
        }, this);
        global.stage.connectObject(
            'captured-event', (_stage, event) => this._onKey(event),
            'notify::key-focus', () => this._onFocusChanged(),
            this);
        global.display.connectObject('notify::focus-window', () => {
            if (global.display.focus_window !== null)
                this._close();
        }, 'window-created', () => this._close(), this);
        Shell.AppSystem.get_default().connectObject('app-state-changed', (_system, app) => {
            if (app.state === Shell.AppState.STARTING)
                this._close();
        }, this);
        this._results = results;
    }

    uninstall() {
        this._sources.clear();
        this._results?.disconnectObject(this);
        global.stage.disconnectObject(this);
        global.display.disconnectObject(this);
        Shell.AppSystem.get_default().disconnectObject(this);
        this._window = this._entry = this._results = null;
    }

    _ownsFocus(focus) {
        return this._entry === focus || this._entry.contains(focus) || this._window.contains(focus);
    }

    _onKey(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        const key = event.get_key_symbol();
        const focus = global.stage.get_key_focus();
        if (key === Clutter.KEY_Escape) {
            const inLauncher = !focus || (this._ownsFocus(focus) && !isPopupMenu(focus));
            if (!inLauncher || !this._stepBack())
                this._close();
            return Clutter.EVENT_STOP;
        }
        const onResultRow = focus && focus !== this._entry && !this._entry.contains(focus) &&
            this._window.contains(focus) && !isPopupMenu(focus);
        if (ACTIVATION_KEYS.includes(key) && onResultRow)
            this._close();
        return Clutter.EVENT_PROPAGATE;
    }

    _onFocusChanged() {
        const focus = global.stage.get_key_focus();
        if (!focus)
            this._entry.grab_key_focus();
        else if (!this._ownsFocus(focus) && !isPopupMenu(focus))
            this._close();
    }
}
