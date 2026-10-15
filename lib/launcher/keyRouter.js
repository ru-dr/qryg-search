// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

const Mod = Object.freeze({
    SUPER: Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.MOD4_MASK,
    CTRL: Clutter.ModifierType.CONTROL_MASK,
    SHIFT: Clutter.ModifierType.SHIFT_MASK,
});
const SUPER_COMBO_WINDOW_US = 1500 * 1000;
const ENTER = [Clutter.KEY_Return, Clutter.KEY_KP_Enter];

function keyIs(symbol, ...keys) {
    return keys.includes(symbol);
}

export class KeyRouter {
    constructor(bindings) {
        this._bindings = bindings;
        this._superAt = 0;
    }

    enable() {
        global.stage.connectObject('captured-event', (_stage, event) => this._route(event), this);
    }

    disable() {
        global.stage.disconnectObject(this);
    }

    takeRecentSuperCombo() {
        const recent = GLib.get_monotonic_time() - this._superAt < SUPER_COMBO_WINDOW_US;
        this._superAt = 0;
        return recent;
    }

    _route(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;
        const symbol = event.get_key_symbol();
        const state = event.get_state();
        const key = {
            symbol,
            super: Boolean(state & Mod.SUPER),
            ctrl: Boolean(state & Mod.CTRL),
            shift: Boolean(state & Mod.SHIFT),
        };
        if (key.super)
            this._superAt = GLib.get_monotonic_time();
        for (const binding of this._bindings) {
            if (binding.matches(key) && binding.run(key) !== false)
                return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
}

export const Keys = Object.freeze({
    superDigit: key => key.super && key.symbol >= Clutter.KEY_1 && key.symbol <= Clutter.KEY_4,
    superEnter: key => key.super && keyIs(key.symbol, ...ENTER),
    superC: key => key.super && keyIs(key.symbol, Clutter.KEY_c, Clutter.KEY_C),
    ctrlShiftE: key => key.ctrl && key.shift && keyIs(key.symbol, Clutter.KEY_e, Clutter.KEY_E),
    ctrlShiftC: key => key.ctrl && key.shift && keyIs(key.symbol, Clutter.KEY_c, Clutter.KEY_C),
    ctrlEnter: key => key.ctrl && !key.shift && keyIs(key.symbol, ...ENTER),
    ctrlTab: key => key.ctrl && !key.super && keyIs(key.symbol, Clutter.KEY_Tab, Clutter.KEY_ISO_Left_Tab, Clutter.KEY_KP_Tab),
    ctrlD: key => key.ctrl && !key.shift && keyIs(key.symbol, Clutter.KEY_d, Clutter.KEY_D),
    acceptCompletion: key => !key.ctrl && !key.super && keyIs(key.symbol, Clutter.KEY_Tab, Clutter.KEY_Right),
    backspace: key => !key.ctrl && !key.super && key.symbol === Clutter.KEY_BackSpace,
    digitIndex: key => key.symbol - Clutter.KEY_1,
});
