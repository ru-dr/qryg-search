// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import {coerce} from './values.js';

function readStore(gsettings) {
    try {
        const data = JSON.parse(gsettings.get_string('plugin-settings'));
        return data && typeof data === 'object' ? data : {};
    } catch {
        return {};
    }
}

export class PluginSettings {
    constructor(gsettings, manifest) {
        this._gsettings = gsettings;
        this._manifest = manifest;
        this._defs = new Map(manifest.settings.map(s => [s.key, s]));
    }

    get definitions() {
        return [...this._defs.values()];
    }

    get(key) {
        const def = this._defs.get(key);
        if (!def)
            return undefined;
        if (def.gsetting)
            return this._gsettings.get_value(def.gsetting).deepUnpack();
        const stored = readStore(this._gsettings)[this._manifest.id]?.[key];
        return coerce(def, stored);
    }

    all() {
        return Object.fromEntries(this.definitions.map(d => [d.key, this.get(d.key)]));
    }

    set(key, value) {
        const def = this._defs.get(key);
        if (!def)
            throw new Error(`unknown setting ${key}`);
        const v = coerce(def, value);
        if (def.gsetting) {
            const type = this._gsettings.get_value(def.gsetting).get_type_string();
            this._gsettings.set_value(def.gsetting, new GLib.Variant(type, v));
            return;
        }
        const store = readStore(this._gsettings);
        store[this._manifest.id] = {...store[this._manifest.id], [key]: v};
        this._gsettings.set_string('plugin-settings', JSON.stringify(store));
    }

    reset(key) {
        const def = this._defs.get(key);
        if (def?.gsetting) {
            this._gsettings.reset(def.gsetting);
            return;
        }
        const store = readStore(this._gsettings);
        if (store[this._manifest.id])
            delete store[this._manifest.id][key];
        this._gsettings.set_string('plugin-settings', JSON.stringify(store));
    }

    keys() {
        return ['plugin-settings', ...this.definitions.filter(d => d.gsetting).map(d => d.gsetting)];
    }
}
