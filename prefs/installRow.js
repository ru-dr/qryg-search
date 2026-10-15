// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {fetchPlugin, install, discard} from '../lib/plugins/installer.js';
import {installWarning} from '../lib/plugins/remote.js';
import {group, escape} from './widgets.js';

function toast(window, title) {
    window.add_toast(new Adw.Toast({title: escape(title), timeout: 5}));
}

function confirm(window, fetched) {
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 12});
    box.append(new Gtk.Label({
        label: installWarning(fetched.source), wrap: true, xalign: 0, selectable: true,
        css_classes: ['warning', 'heading'],
    }));
    const list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list']});
    box.append(list);
    for (const [label, value] of fetched.card) {
        const row = new Adw.ActionRow({title: escape(label), subtitle: escape(value), css_classes: ['property']});
        row.subtitle_selectable = true;
        list.append(row);
    }
    const dialog = new Adw.AlertDialog({
        heading: `Install ${fetched.manifest.name}?`,
        extra_child: box,
        default_response: 'cancel',
        close_response: 'cancel',
    });
    dialog.add_response('cancel', 'Cancel');
    dialog.add_response('install', fetched.existing ? 'Replace' : 'Install');
    dialog.set_response_appearance('install', fetched.manifest.type === 'js'
        ? Adw.ResponseAppearance.DESTRUCTIVE : Adw.ResponseAppearance.SUGGESTED);
    return new Promise(resolve => {
        dialog.connect('response', (_dialog, response) => resolve(response === 'install'));
        dialog.present(window);
    });
}

export function installGroup({window, settings}, onInstalled) {
    const row = new Adw.EntryRow({title: 'Folder, git repository, archive or manifest.json URL'});
    const spinner = new Adw.Spinner({visible: false});
    const button = new Gtk.Button({label: 'Install', valign: Gtk.Align.CENTER, css_classes: ['suggested-action']});
    row.add_suffix(spinner);
    row.add_suffix(button);
    let cancellable = null;

    const busy = on => {
        spinner.visible = on;
        row.editable = !on;
        button.label = on ? 'Cancel' : 'Install';
        button.css_classes = on ? [] : ['suggested-action'];
    };

    const start = async () => {
        if (cancellable) {
            cancellable.cancel();
            return;
        }
        const source = row.text.trim();
        if (!source)
            return;
        const current = cancellable = new Gio.Cancellable();
        busy(true);
        let fetched = null;
        try {
            fetched = await fetchPlugin(source, current);
            busy(false);
            cancellable = null;
            if (!await confirm(window, fetched))
                return;
            await install(fetched);
            settings.set_int('plugins-reload', settings.get_int('plugins-reload') + 1);
            row.text = '';
            onInstalled();
            toast(window, `Installed ${fetched.manifest.name} ${fetched.manifest.version ?? ''}`.trimEnd());
        } catch (e) {
            if (!current.is_cancelled())
                toast(window, `Could not install: ${e.message}`);
        } finally {
            if (fetched)
                await discard(fetched);
            if (cancellable === current) {
                cancellable = null;
                busy(false);
            }
        }
    };
    row.connect('entry-activated', () => start().catch(logError));
    button.connect('clicked', () => start().catch(logError));
    return group('Install a plugin', [row],
        'Paste a git repository, a repository folder (…/tree/main/plugins/name), a .zip or .tar.gz link, or a manifest.json link. ' +
        'Plugins run code on your computer: only install plugins from sources you trust, and read the code first.');
}
