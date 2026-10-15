// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import * as Bookmarks from '../lib/core/bookmarks.js';
import {page, group, escape} from './widgets.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open', 'open_finish');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder', 'select_folder_finish');

const ICONS = {
    command: 'utilities-terminal-symbolic',
    site: 'web-browser-symbolic',
    location: 'folder-remote-symbolic',
    folder: 'folder-symbolic',
    file: 'text-x-generic-symbolic',
};

export function buildBookmarksPage({window}) {
    const nameRow = new Adw.EntryRow({title: 'Name (optional)'});
    const targetRow = new Adw.EntryRow({title: 'Target', show_apply_button: true});
    const pick = async folder => {
        const dialog = new Gtk.FileDialog({modal: true});
        try {
            const file = folder
                ? await dialog.select_folder(window, null)
                : await dialog.open(window, null);
            if (file)
                targetRow.text = Bookmarks.normalizeTarget(file.get_path() ?? file.get_uri());
        } catch {}
    };
    for (const [icon, tip, folder] of [['document-open-symbolic', 'Choose a file', false], ['folder-open-symbolic', 'Choose a folder', true]]) {
        const button = new Gtk.Button({icon_name: icon, tooltip_text: tip, valign: Gtk.Align.CENTER, css_classes: ['flat']});
        button.connect('clicked', () => pick(folder));
        targetRow.add_suffix(button);
    }
    const addButton = new Gtk.Button({label: 'Add', valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
    const addRow = new Adw.ActionRow({title: ''});
    addRow.add_suffix(addButton);
    const addGroup = group('Add bookmark', [nameRow, targetRow, addRow],
        'A file, folder, sftp:// or smb:// location, website, or a command starting with >');
    const listGroup = group('Saved', []);
    let rows = [];

    const refresh = () => {
        for (const row of rows)
            listGroup.remove(row);
        rows = [];
        const list = Bookmarks.load();
        if (list.length === 0) {
            const empty = new Adw.ActionRow({title: 'No bookmarks yet', subtitle: 'In QryG, select a file, site or command and press Ctrl+D, or type *+ followed by a target'});
            listGroup.add(empty);
            rows.push(empty);
            return;
        }
        for (const b of list) {
            const kind = b.type ?? Bookmarks.kindOf(b.target);
            const row = new Adw.ActionRow({title: escape(b.name), subtitle: escape(b.target), subtitle_lines: 1});
            row.add_prefix(new Gtk.Image({icon_name: ICONS[kind] ?? 'user-bookmarks-symbolic'}));
            const del = new Gtk.Button({icon_name: 'user-trash-symbolic', tooltip_text: 'Remove', valign: Gtk.Align.CENTER, css_classes: ['flat']});
            del.connect('clicked', () => {
                Bookmarks.remove(b.name);
                refresh();
            });
            row.add_suffix(del);
            listGroup.add(row);
            rows.push(row);
        }
    };

    const submit = () => {
        const target = targetRow.text.trim();
        if (!target) {
            targetRow.add_css_class('error');
            return;
        }
        targetRow.remove_css_class('error');
        Bookmarks.add(target, nameRow.text);
        nameRow.text = '';
        targetRow.text = '';
        refresh();
    };
    addButton.connect('clicked', submit);
    targetRow.connect('apply', submit);
    nameRow.connect('entry-activated', () => targetRow.grab_focus());

    refresh();
    return page('Bookmarks', 'user-bookmarks-symbolic', [addGroup, listGroup]);
}
