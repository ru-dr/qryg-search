// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import {scan, isValidKeyword, isWordKeyword} from './manifest.js';
import {PluginProvider} from './provider.js';
import * as Host from './host.js';
import {baseScore, rankProviders} from '../results/ranking.js';

const EXT_DIR = GLib.path_get_dirname(GLib.path_get_dirname(GLib.path_get_dirname(
    GLib.filename_from_uri(import.meta.url)[0])));
export const BUNDLED_DIR = GLib.build_filenamev([EXT_DIR, 'plugins']);

export class PluginManager {
    constructor(config, services) {
        this._config = config;
        this._gsettings = config.gsettings;
        this._services = services;
        this._view = null;
        this._providers = [];
        this._generation = 0;
        this.broken = [];
    }

    get providers() {
        return this._providers;
    }

    provider(id) {
        return this._providers.find(p => p.id === id || p.manifest.id === id) ?? null;
    }

    isEnabled(provider) {
        if (!provider.isQrygSearchPlugin)
            return true;
        if (this._config.disabledProviders.includes(provider.id))
            return false;
        const toggle = provider.manifest.toggle;
        if (toggle) {
            try {
                return this._gsettings.get_boolean(toggle);
            } catch {}
        }
        return true;
    }

    keywords() {
        return this._providers
            .filter(p => p.keyword && this.isEnabled(p))
            .map(p => [p.keyword, p.id])
            .sort((a, b) => b[0].length - a[0].length);
    }

    matchKeyword(text) {
        const lower = text.toLowerCase();
        for (const [keyword, id] of this.keywords()) {
            const prefix = keyword.toLowerCase();
            if (isWordKeyword(keyword) ? lower.startsWith(`${prefix} `) : lower.startsWith(prefix))
                return id;
        }
        return null;
    }

    _applyKeywords() {
        let custom = {};
        try {
            custom = JSON.parse(this._gsettings.get_string('keywords')) ?? {};
        } catch {}
        for (const provider of this._providers) {
            const value = custom[provider.manifest.id];
            provider.keyword = value === undefined ? provider.defaultKeyword
                : value === '' ? null
                    : isValidKeyword(value) ? value : provider.defaultKeyword;
        }
    }

    async load(view) {
        this._view = view;
        const generation = ++this._generation;
        const {plugins, broken} = scan(BUNDLED_DIR);
        this.broken = broken;
        for (const b of broken)
            Host.log(b.id ?? GLib.path_get_basename(b.dir), 'not loaded:', b.problems.join('; '));
        for (const manifest of plugins) {
            const provider = new PluginProvider(manifest, this._gsettings, this._services);
            try {
                await provider.load();
            } catch (e) {
                this.broken.push({dir: manifest.dir, id: manifest.id, problems: [String(e.message ?? e)]});
                Host.log(manifest.id, 'failed to load:', e.message ?? e);
                provider.destroy();
                continue;
            }
            if (generation !== this._generation || this._view !== view) {
                provider.destroy();
                return;
            }
            this._providers.push(provider);
            view._registerProvider(provider);
        }
        this._applyKeywords();
        this._config.onChanged(['keywords'], () => this._applyKeywords(), this);
        this.order();
    }

    unload() {
        this._config.disconnect(this);
        this._generation++;
        this._services.beforeUnload?.();
        const selected = this._view?._defaultResult;
        if (selected && this._providers.some(p => p.display?.hasRow?.(selected)))
            this._view._defaultResult = null;
        for (const provider of this._providers) {
            this._view?._unregisterProvider(provider);
            provider.destroy();
        }
        this._providers = [];
        this._view = null;
    }

    async reload() {
        const view = this._view;
        if (!view)
            return;
        this.unload();
        await this.load(view);
    }

    order() {
        if (this._view)
            this._arrange(rankProviders(this._view._providers, baseScore));
    }

    rank() {
        const view = this._view;
        if (!view)
            return;
        this._arrange(rankProviders(view._providers, provider => {
            const ids = view._results?.[provider.id] ?? [];
            return (provider.isQrygSearchPlugin ? provider.bestScore(ids) : null) ?? baseScore(provider);
        }));
    }

    _arrange(ordered) {
        const view = this._view;
        const all = view._providers;
        if (ordered.every((p, i) => all[i] === p))
            return;
        all.splice(0, all.length, ...ordered);
        ordered.forEach((p, i) => {
            if (p.display?.get_parent() === view._content)
                view._content.set_child_at_index(p.display, i);
        });
    }
}
