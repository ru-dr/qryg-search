// SPDX-License-Identifier: GPL-3.0-or-later
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class GlobalShortcut {
    constructor(callback) {
        this._callback = callback;
        this._action = Meta.KeyBindingAction.NONE;
        this._name = null;
        this._accelerator = null;
    }

    enable(accelerator) {
        global.display.connectObject('accelerator-activated', (_display, action) => {
            if (action === this._action)
                this._callback();
        }, this);
        this.rebind(accelerator);
    }

    rebind(accelerator) {
        if (accelerator === this._accelerator)
            return true;
        const action = global.display.grab_accelerator(accelerator, Meta.KeyBindingFlags.NONE);
        if (action === Meta.KeyBindingAction.NONE) {
            console.warn(`qryg-search: could not grab shortcut ${accelerator}`);
            return false;
        }
        this._release();
        this._action = action;
        this._name = Meta.external_binding_name_for_action(action);
        this._accelerator = accelerator;
        Main.wm.allowKeybinding(this._name, Shell.ActionMode.ALL);
        return true;
    }

    disable() {
        this._release();
        global.display.disconnectObject(this);
    }

    _release() {
        if (this._action === Meta.KeyBindingAction.NONE)
            return;
        global.display.ungrab_accelerator(this._action);
        delete Main.wm._allowedKeybindings[this._name];
        this._action = Meta.KeyBindingAction.NONE;
        this._name = null;
        this._accelerator = null;
    }
}
