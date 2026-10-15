// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Host from './host.js';
import {fetchJson, match, readText} from './helpers.js';
import {copyRow, warningRow} from './rows.js';
import {PluginSettings} from './settings.js';
import {pluginDirs} from './script.js';
import {matchWords} from './text.js';

export class Tracker {
    constructor() {
        this._stops = new Set();
        this.cancellable = new Gio.Cancellable();
    }

    add(stop) {
        const once = () => {
            if (this._stops.delete(once))
                stop();
        };
        this._stops.add(once);
        return once;
    }

    clear() {
        this.cancellable.cancel();
        for (const stop of [...this._stops])
            stop();
    }
}

function guard(manifest, fn) {
    try {
        return fn();
    } catch (e) {
        Host.log(manifest.id, 'callback failed:', e.message ?? e);
        return false;
    }
}

function source(tracker, manifest, add, fn) {
    let id = 0;
    const stop = tracker.add(() => {
        if (id)
            GLib.source_remove(id);
        id = 0;
    });
    id = add(() => {
        if (guard(manifest, fn) === true)
            return GLib.SOURCE_CONTINUE;
        id = 0;
        stop();
        return GLib.SOURCE_REMOVE;
    });
    return stop;
}

export function createApi(manifest, gsettings, services, tracker = new Tracker()) {
    const settings = new PluginSettings(gsettings, manifest);
    const dirs = pluginDirs(manifest);
    const ensure = dir => {
        GLib.mkdir_with_parents(dir, 0o755);
        return dir;
    };
    const connect = (object, signal, callback) => {
        const id = object.connect(signal, callback);
        return tracker.add(() => object.disconnect(id));
    };
    return {
        id: manifest.id,
        name: manifest.name,
        dir: manifest.dir,
        get cacheDir() {
            return ensure(dirs.cache);
        },
        get configDir() {
            return ensure(dirs.config);
        },
        settings: {
            get: key => settings.get(key),
            set: (key, value) => settings.set(key, value),
            all: () => settings.all(),
            onChanged: callback => {
                let last = settings.all();
                const changed = () => {
                    const now = settings.all();
                    const keys = Object.keys(now).filter(k => JSON.stringify(now[k]) !== JSON.stringify(last[k]));
                    last = now;
                    if (keys.length > 0)
                        guard(manifest, () => callback(keys));
                };
                const stops = settings.keys().map(k => connect(gsettings, `changed::${k}`, changed));
                return () => stops.forEach(stop => stop());
            },
        },
        qrygSearchSettings: gsettings,
        copy: Host.copy,
        open: Host.open,
        spawn: Host.spawn,
        terminal: command => Host.runInTerminal(gsettings, command),
        findTerminal: () => Host.findTerminal(gsettings),
        notify: Host.notify,
        log: (...args) => Host.log(manifest.id, ...args),
        refresh: () => services.refresh(),
        expandPath: Host.expandPath,
        tildify: Host.tildify,
        timeout: (ms, fn) => source(tracker, manifest, f => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, f), fn),
        idle: fn => source(tracker, manifest, f => GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, f), fn),
        connect,
        fetchJson: (url, options = {}) => fetchJson(url, {
            ...options, cacheDir: options.ttl > 0 ? ensure(dirs.cache) : null, owner: tracker.cancellable,
        }),
        match,
        matchWords,
        readText,
        copyRow,
        warningRow,
        services,
    };
}
