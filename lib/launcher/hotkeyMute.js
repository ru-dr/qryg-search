// SPDX-License-Identifier: GPL-3.0-or-later
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {FILTERS} from './filters.js';

const DASH_HOTKEY = /^(?:switch-to-application|app-hotkey|app-shift-hotkey|app-ctrl-hotkey)-(\d+)$/;

function isFilterHotkey(name) {
    const digit = Number(DASH_HOTKEY.exec(name)?.[1]);
    return digit >= 1 && digit <= FILTERS.length;
}

export class HotkeyMute {
    constructor() {
        this._saved = new Map();
    }

    mute() {
        for (const [name, mode] of Object.entries(Main.wm._allowedKeybindings)) {
            if (isFilterHotkey(name) && !this._saved.has(name)) {
                this._saved.set(name, mode);
                Main.wm._allowedKeybindings[name] = Shell.ActionMode.NONE;
            }
        }
    }

    unmute() {
        for (const [name, mode] of this._saved)
            Main.wm._allowedKeybindings[name] = mode;
        this._saved.clear();
    }
}
