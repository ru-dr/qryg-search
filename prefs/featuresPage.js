// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {normalizeResultPriority} from '../lib/results/providers.js';
import {page, group, switchRow, escape, watchSetting} from './widgets.js';

const FEATURES = [
    ['top-hit', 'Top Hit', 'Lift the best match into its own section'],
    ['completion', 'Inline completion', 'Tab or Right accepts the faded rest of the name'],
    ['bar-icon', 'Bar icon follows the selection', 'The magnifier becomes the selected result icon'],
    ['preview', 'Preview pane', 'Details beside the results'],
    ['filters', 'Filter buttons', 'Apps, Files, Actions and Clipboard, also Super+1 to Super+4'],
    ['row-actions', 'Row actions', 'Buttons on the selected row: bookmark, new window, open folder, copy'],
    ['file-actions', 'Super shortcuts for files', 'Super+Enter shows the file, Super+C copies its path'],
    ['keywords', 'Prefixes', 'Typing a plugin prefix searches only that plugin'],
    ['remember-query', 'Remember last search', 'Reopen with the previous query selected'],
    ['bounce', 'Bounce on open', 'A slight spring when it opens'],
    ['calculator-style', 'Answer-first GNOME Calculator', 'Only matters when the GNOME Calculator source is on'],
];

const KINDS = {
    apps: ['Apps', 'Applications, system actions and open windows'],
    actions: ['Actions', 'Calculator, units, currency, colours, time, generators, shell, processes and Settings'],
    files: ['Files', 'File search, recent files and your home folders'],
    general: ['Other', 'Bookmarks, emoji, web search and other search providers'],
    clipboard: ['Clipboard', 'Clipboard history'],
};

function moveButton(icon, tooltip, enabled, onClicked) {
    const button = new Gtk.Button({icon_name: icon, tooltip_text: tooltip, sensitive: enabled, valign: Gtk.Align.CENTER});
    button.add_css_class('flat');
    button.connect('clicked', onClicked);
    return button;
}

function priorityGroup(settings) {
    const result = new Adw.PreferencesGroup({
        title: 'Result priority',
        description: 'Kinds higher in the list come first, and the first one with a match gives the Top Hit',
    });
    const reset = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER});
    reset.add_css_class('flat');
    reset.connect('clicked', () => settings.reset('result-priority'));
    result.set_header_suffix(reset);
    let rows = [];
    const render = () => {
        rows.forEach(row => result.remove(row));
        const order = normalizeResultPriority(settings.get_strv('result-priority'));
        const move = (from, to) => {
            const next = [...order];
            next.splice(to, 0, next.splice(from, 1)[0]);
            settings.set_strv('result-priority', next);
        };
        rows = order.map((kind, i) => {
            const [title, subtitle] = KINDS[kind];
            const row = new Adw.ActionRow({title: escape(`${i + 1}. ${title}`), subtitle: escape(subtitle)});
            row.add_suffix(moveButton('go-up-symbolic', `Move ${title} up`, i > 0, () => move(i, i - 1)));
            row.add_suffix(moveButton('go-down-symbolic', `Move ${title} down`, i < order.length - 1, () => move(i, i + 1)));
            result.add(row);
            return row;
        });
    };
    render();
    watchSetting(settings, 'result-priority', render);
    return result;
}

export function buildFeaturesPage({settings}) {
    return page('Features', 'emblem-system-symbolic', [
        group('Features', FEATURES.map(([key, title, subtitle]) => switchRow(settings, `feature-${key}`, title, subtitle))),
        priorityGroup(settings),
    ]);
}
