// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {LOOK_KEYS} from '../lib/core/config.js';
import {STYLES_DIR, listStyles} from '../lib/core/userStyles.js';
import {page, group, choiceRow, colorRow, spinRow, entryRow, buttonRow} from './widgets.js';

const THEMES = [
    {value: 'default', label: 'Follow system'},
    {value: 'dark', label: 'Dark'},
    {value: 'light', label: 'Light'},
];

function styleChoices() {
    return [{value: '', label: 'Built-in'}, ...listStyles().map(name => ({value: name, label: name}))];
}

function openStylesFolder() {
    GLib.mkdir_with_parents(STYLES_DIR, 0o755);
    Gio.AppInfo.launch_default_for_uri(GLib.filename_to_uri(STYLES_DIR, null), null);
}

export function buildAppearancePage({settings}) {
    return page('Appearance', 'applications-graphics-symbolic', [
        group('Look', [
            choiceRow(settings, 'style', 'Style', 'A CSS file from your styles folder, applied on top of the built-in look', styleChoices()),
            buttonRow('Styles folder', STYLES_DIR, [{label: 'Open', onClicked: openStylesFolder}]),
            choiceRow(settings, 'theme-preference', 'Theme', 'Dark, light, or follow the system', THEMES),
            colorRow(settings, 'accent-color', 'Accent color', 'The selected row, active filter and caret'),
            entryRow(settings, 'placeholder', 'Placeholder text'),
        ]),
        group('Size', [
            spinRow(settings, 'width', 'Width', 'Popup width in pixels', 400, 1200, 10),
            spinRow(settings, 'top-offset', 'Top offset', 'Percent from the top of the screen', 5, 60),
            spinRow(settings, 'max-rows', 'Rows per section', 'Results shown for each source', 1, 15),
            spinRow(settings, 'corner-radius', 'Corner radius', 'The bar, rows and preview follow it', 0, 40),
            spinRow(settings, 'opacity', 'Opacity', 'Percent', 50, 100),
            spinRow(settings, 'font-size', 'Font size', 'Pixels in the bar. Results and the preview scale with it', 12, 32),
        ]),
        group('Reset', [
            buttonRow('Reset appearance', 'Accent color, corner radius, opacity and font size', [
                {label: 'Reset', onClicked: () => LOOK_KEYS.forEach(key => settings.reset(key))},
            ]),
        ]),
    ]);
}
