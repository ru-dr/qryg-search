// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {scan, providerId, isValidKeyword, USER_PLUGIN_DIR} from '../lib/plugins/manifest.js';
import {PluginSettings} from '../lib/plugins/settings.js';
import {page, group, buttonRow, escape} from './widgets.js';

function readKeywords(settings) {
    try {
        return JSON.parse(settings.get_string('keywords')) ?? {};
    } catch {
        return {};
    }
}

function isEnabled(settings, manifest) {
    const off = settings.get_strv('disabled-providers').includes(providerId(manifest.id));
    return !off && (!manifest.toggle || settings.get_boolean(manifest.toggle));
}

function setEnabled(settings, manifest, enabled) {
    const off = new Set(settings.get_strv('disabled-providers'));
    if (enabled) {
        off.delete(providerId(manifest.id));
        if (manifest.toggle)
            settings.set_boolean(manifest.toggle, true);
    } else {
        off.add(providerId(manifest.id));
    }
    settings.set_strv('disabled-providers', [...off].sort());
}

function keywordRow(settings, manifest) {
    const custom = readKeywords(settings)[manifest.id];
    const row = new Adw.EntryRow({
        title: escape(`Prefix (default: ${manifest.keyword ?? 'none'}; empty for none)`),
        text: custom ?? manifest.keyword ?? '',
        show_apply_button: true,
    });
    row.connect('apply', () => {
        const value = row.text.trim();
        if (value && !isValidKeyword(value)) {
            row.add_css_class('error');
            return;
        }
        row.remove_css_class('error');
        const keywords = readKeywords(settings);
        if (value === (manifest.keyword ?? ''))
            delete keywords[manifest.id];
        else
            keywords[manifest.id] = value;
        settings.set_string('keywords', JSON.stringify(keywords));
    });
    return row;
}

function settingRow(store, def) {
    const title = escape(def.title ?? def.key);
    const subtitle = escape(def.description ?? '');
    switch (def.type) {
    case 'bool': {
        const row = new Adw.SwitchRow({title, subtitle, active: Boolean(store.get(def.key))});
        row.connect('notify::active', () => store.set(def.key, row.active));
        return row;
    }
    case 'int': {
        const adjustment = new Gtk.Adjustment({lower: def.min ?? -1e9, upper: def.max ?? 1e9, step_increment: 1});
        const row = new Adw.SpinRow({title, subtitle, adjustment});
        row.value = store.get(def.key);
        row.connect('notify::value', () => store.set(def.key, Math.round(row.value)));
        return row;
    }
    case 'choice': {
        const choices = def.choices ?? [];
        const row = new Adw.ComboRow({title, subtitle, model: Gtk.StringList.new(choices)});
        row.selected = Math.max(0, choices.indexOf(store.get(def.key)));
        row.connect('notify::selected', () => store.set(def.key, choices[row.selected]));
        return row;
    }
    default: {
        const isList = def.type === 'strings';
        const value = store.get(def.key);
        const row = new Adw.EntryRow({
            title: isList ? `${title} (comma separated)` : title,
            text: isList ? (value ?? []).join(', ') : String(value ?? ''),
            show_apply_button: true,
        });
        row.connect('apply', () => store.set(def.key, isList ? row.text.split(',').map(x => x.trim()).filter(Boolean) : row.text));
        return row;
    }
    }
}

function pluginRow(settings, manifest) {
    const keyword = manifest.keyword ? `  ·  prefix ${manifest.keyword}` : '';
    const row = new Adw.ExpanderRow({
        title: escape(manifest.name),
        subtitle: escape(`${manifest.description}${keyword}`),
        show_enable_switch: true,
        enable_expansion: isEnabled(settings, manifest),
    });
    row.add_prefix(new Gtk.Image({icon_name: manifest.icon}));
    row.connect('notify::enable-expansion', () => setEnabled(settings, manifest, row.enable_expansion));
    row.add_row(new Adw.ActionRow({
        title: escape(`${manifest.type === 'js' ? 'JavaScript' : 'Script'} plugin · v${manifest.version}`),
        subtitle: escape(manifest.dir),
    }));
    row.add_row(keywordRow(settings, manifest));
    const store = new PluginSettings(settings, manifest);
    for (const def of manifest.settings)
        row.add_row(settingRow(store, def));
    return row;
}

function openUserFolder() {
    GLib.mkdir_with_parents(USER_PLUGIN_DIR, 0o755);
    Gio.AppInfo.launch_default_for_uri(GLib.filename_to_uri(USER_PLUGIN_DIR, null), null);
}

export function buildPluginsPage({settings, path}) {
    const {plugins, broken} = scan(GLib.build_filenamev([path, 'plugins']));
    const byName = (a, b) => a.name.localeCompare(b.name);
    const groups = [group('Plugins', [
        buttonRow('Your plugins folder', USER_PLUGIN_DIR, [
            {label: 'Open', onClicked: openUserFolder},
            {label: 'Reload', onClicked: () => settings.set_int('plugins-reload', settings.get_int('plugins-reload') + 1)},
        ]),
    ], 'Turn plugins on or off, change their prefix and settings. Create one with `qryg-search plugin new`.')];
    for (const [title, list] of [['Bundled', plugins.filter(p => p.bundled)], ['Installed', plugins.filter(p => !p.bundled)]]) {
        if (list.length > 0)
            groups.push(group(title, list.sort(byName).map(m => pluginRow(settings, m))));
    }
    if (broken.length > 0) {
        groups.push(group('Not loaded', broken.map(b => new Adw.ActionRow({
            title: escape(b.id ?? GLib.path_get_basename(b.dir)),
            subtitle: escape(b.problems.join('; ')),
        })), 'Fix these manifests, then press Reload'));
    }
    return page('Plugins', 'application-x-addon-symbolic', groups);
}
