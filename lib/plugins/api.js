// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import * as Host from './host.js';
import {PluginSettings} from './settings.js';
import {pluginDirs} from './script.js';

export function createApi(manifest, gsettings, services) {
    const settings = new PluginSettings(gsettings, manifest);
    const dirs = pluginDirs(manifest);
    const ensure = dir => {
        GLib.mkdir_with_parents(dir, 0o755);
        return dir;
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
                const ids = settings.keys().map(k => gsettings.connect(`changed::${k}`, () => callback()));
                return () => ids.forEach(id => gsettings.disconnect(id));
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
        services,
    };
}
