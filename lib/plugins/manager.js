// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import {scan, isValidKeyword, isWordKeyword} from './manifest.js';
import {PluginProvider} from './provider.js';
import * as Host from './host.js';
import {baseScore, rankProviders} from '../results/ranking.js';

const EXT_DIR = GLib.path_get_dirname(GLib.path_get_dirname(GLib.path_get_dirname(
    GLib.filename_from_uri(import.meta.url)[0])));
export const BUNDLED_DIR = GLib.build_filenamev([EXT_DIR, 'plugins']);
const STATUS_DELAY_S = 3;

export class PluginManager {
    constructor(config, services) {
        this._config = config;
        this._gsettings = config.gsettings;
        this._services = services;
        this._view = null;
        this._providers = [];
        this._generation = 0;
        this._statusId = 0;
        this._status = null;
        this._loadedAt = 0;
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

    async _create(manifest, generation, view) {
        const provider = new PluginProvider(manifest, this._gsettings, this._services, () => this._queueStatus());
        try {
            await provider.load();
        } catch (e) {
            this.broken.push({dir: manifest.dir, id: manifest.id, problems: [String(e.message ?? e)]});
            Host.log(manifest.id, 'failed to load:', e.message ?? e);
            provider.destroy();
            return false;
        }
        if (generation !== this._generation || this._view !== view) {
            provider.destroy();
            return null;
        }
        this._providers.push(provider);
        view._registerProvider(provider);
        provider.setActive(this.isEnabled(provider));
        return true;
    }

    async load(view) {
        this._view = view;
        const generation = ++this._generation;
        const {plugins, broken} = scan(BUNDLED_DIR);
        this.broken = broken;
        this._loadedAt = Math.floor(Date.now() / 1000);
        for (const b of broken)
            Host.log(b.id ?? GLib.path_get_basename(b.dir), 'not loaded:', b.problems.join('; '));
        for (const manifest of plugins) {
            if (await this._create(manifest, generation, view) === null)
                return;
        }
        this._applyKeywords();
        this._watch();
        this.order();
        this._queueStatus();
    }

    async reloadOne(id) {
        const view = this._view;
        if (!view)
            return;
        const generation = this._generation;
        const old = this._providers.find(p => p.manifest.id === id);
        if (old)
            this._drop(old);
        this.broken = this.broken.filter(b => b.id !== id);
        const {plugins, broken} = scan(BUNDLED_DIR);
        this.broken.push(...broken.filter(b => b.id === id));
        const manifest = plugins.find(m => m.id === id);
        if (manifest && await this._create(manifest, generation, view) === null)
            return;
        if (!manifest)
            Host.log(id, 'not loaded after reload');
        this._applyKeywords();
        this._watch();
        this.order();
        this._queueStatus();
    }

    _drop(provider) {
        this._services.beforeUnload?.();
        const selected = this._view?._defaultResult;
        if (selected && provider.display?.hasRow?.(selected))
            this._view._defaultResult = null;
        this._view?._unregisterProvider(provider);
        provider.destroy();
        this._providers = this._providers.filter(p => p !== provider);
    }

    _watch() {
        this._config.disconnect(this);
        const toggles = [...new Set(this._providers.map(p => p.manifest.toggle).filter(Boolean))];
        this._config.onChanged(['keywords'], () => this._applyKeywords(), this);
        this._config.onChanged(['disabled-providers', ...toggles], () => this._syncActive(), this);
        this._config.onChanged(['plugins-reload-id'], () => this._onReloadId(), this);
    }

    _syncActive() {
        for (const provider of this._providers)
            provider.setActive(this.isEnabled(provider));
    }

    _onReloadId() {
        const id = this._gsettings.get_string('plugins-reload-id').split('#')[0].trim();
        if (id)
            this.reloadOne(id).catch(e => Host.log(id, 'reload failed:', e.message ?? e));
    }

    _queueStatus() {
        if (this._statusId)
            return;
        this._statusId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, STATUS_DELAY_S, () => {
            this._statusId = 0;
            this._writeStatus();
            return GLib.SOURCE_REMOVE;
        });
    }

    _writeStatus() {
        const status = {};
        for (const b of this.broken) {
            status[b.id ?? GLib.path_get_basename(b.dir)] = {problems: b.problems, at: this._loadedAt};
        }
        for (const {manifest, stats} of this._providers) {
            if (stats.lastError) {
                status[manifest.id] = {
                    lastError: stats.lastError, errors: stats.errors, timeouts: stats.timeouts, at: stats.at,
                };
            }
        }
        const text = JSON.stringify(status);
        if (text === this._status)
            return;
        this._status = text;
        try {
            if (this._gsettings.get_string('plugin-status') !== text)
                this._gsettings.set_string('plugin-status', text);
        } catch (e) {
            console.warn('qryg-search: could not save plugin status:', e.message ?? e);
        }
    }

    unload() {
        this._config.disconnect(this);
        this._generation++;
        if (this._statusId)
            GLib.source_remove(this._statusId);
        this._statusId = 0;
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
