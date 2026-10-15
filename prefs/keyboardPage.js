// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import {page, group, buttonRow, watchSetting} from './widgets.js';

const MODIFIER_KEYS = [
    Gdk.KEY_Control_L, Gdk.KEY_Control_R, Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
    Gdk.KEY_Alt_L, Gdk.KEY_Alt_R, Gdk.KEY_Super_L, Gdk.KEY_Super_R, Gdk.KEY_Caps_Lock,
];
const REQUIRED_MODIFIERS = Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK;

function formatShortcut(accelerator) {
    if (!accelerator)
        return 'Not set';
    return accelerator
        .replace(/<Super>/g, 'Super+')
        .replace(/<Control>/g, 'Ctrl+')
        .replace(/<Shift>/g, 'Shift+')
        .replace(/<Alt>/g, 'Alt+');
}

function shortcutRow(settings) {
    const row = new Adw.ActionRow({title: 'Open and close QryG', subtitle: 'Click, then press a key combination', activatable: true});
    const label = new Gtk.Label({valign: Gtk.Align.CENTER});
    const show = () => (label.label = formatShortcut(settings.get_strv('toggle-shortcut')[0]));
    let capturing = false;
    const controller = new Gtk.EventControllerKey();
    controller.connect('key-pressed', (_controller, keyval, keycode, state) => {
        if (!capturing || MODIFIER_KEYS.includes(keyval))
            return capturing;
        if (keyval === Gdk.KEY_Escape) {
            capturing = false;
            show();
            return true;
        }
        const mask = state & Gtk.accelerator_get_default_mod_mask();
        if (!(mask & REQUIRED_MODIFIERS)) {
            label.label = 'Needs Super, Ctrl or Alt';
            return true;
        }
        const accelerator = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
        if (accelerator) {
            settings.set_strv('toggle-shortcut', [accelerator]);
            capturing = false;
            show();
        }
        return true;
    });
    row.connect('activated', () => {
        capturing = true;
        label.label = 'Press a key combination';
        row.grab_focus();
    });
    row.add_suffix(label);
    row.add_controller(controller);
    watchSetting(settings, 'toggle-shortcut', show);
    show();
    return row;
}

export function buildKeyboardPage({settings}) {
    return page('Keyboard', 'input-keyboard-symbolic', [
        group('Shortcut', [
            shortcutRow(settings),
            buttonRow('Reset', 'Back to Super+Space', [{label: 'Reset', onClicked: () => settings.reset('toggle-shortcut')}]),
        ]),
    ]);
}
