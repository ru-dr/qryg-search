// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import * as Host from './host.js';
import {providerId} from './manifest.js';
import {createApi} from './api.js';
import {runScript} from './script.js';
import {ScriptServer} from './server.js';

const MAX_RESULTS = 50;
let loadCount = 0;

function matchesFilter(filter, category) {
    return filter !== null && filter === category;
}

class ScriptImpl {
    constructor(manifest, api) {
        this._manifest = manifest;
        this._api = api;
        this._server = manifest.persistent
            ? new ScriptServer(manifest, {onRefresh: () => api.refresh(), log: (...args) => api.log(...args)})
            : null;
    }

    _call(method, payload, cancellable) {
        const request = {...payload, settings: this._api.settings.all()};
        return this._server
            ? this._server.request(method, request, cancellable)
            : runScript(this._manifest, method, request, cancellable);
    }

    async query(ctx) {
        const data = await this._call('query', {
            query: ctx.query, raw: ctx.raw, forced: ctx.forced, filter: ctx.filter,
        }, ctx.cancellable);
        return Array.isArray(data) ? data : data?.results ?? [];
    }

    activate(result, action) {
        return this._call('activate', {result, action: action ?? null}, null);
    }

    destroy() {
        this._server?.destroy();
    }
}

export class PluginProvider {
    constructor(manifest, gsettings, services) {
        this.manifest = manifest;
        this.id = providerId(manifest.id);
        this.displayName = manifest.name;
        this.keyword = manifest.keyword;
        this.defaultKeyword = manifest.keyword;
        this.category = manifest.category;
        this.globalSearch = manifest.global;
        this.completion = manifest.completion;
        this.position = manifest.position;
        this.priority = manifest.priority;
        this.isRemoteProvider = false;
        this.canLaunchSearch = false;
        this.isQrygSearchPlugin = true;
        this._gsettings = gsettings;
        this._services = services;
        this._results = new Map();
        this.api = createApi(manifest, gsettings, services);
        this.impl = null;
    }

    async load() {
        if (this.manifest.type === 'script') {
            this.impl = new ScriptImpl(this.manifest, this.api);
            return;
        }
        const url = GLib.filename_to_uri(GLib.build_filenamev([this.manifest.dir, this.manifest.main]), null);
        const module = await import(`${url}?v=${++loadCount}`);
        const Plugin = module.default;
        if (typeof Plugin !== 'function')
            throw new Error(`${this.manifest.main} has no default export class`);
        this.impl = new Plugin(this.api);
        if (typeof this.impl.query !== 'function')
            throw new Error('plugin class has no query() method');
    }

    get available() {
        try {
            return typeof this.impl?.available === 'function' ? Boolean(this.impl.available()) : true;
        } catch {
            return false;
        }
    }

    result(id) {
        return this._results.get(id) ?? null;
    }

    _scoreOf(id) {
        const score = this._results.get(id)?.score;
        return typeof score === 'number' && Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : null;
    }

    _byScore(ids) {
        if (!ids.some(id => this._scoreOf(id) !== null))
            return ids;
        return ids
            .map((id, index) => ({id, index, score: this._scoreOf(id) ?? -1}))
            .sort((a, b) => b.score - a.score || a.index - b.index)
            .map(entry => entry.id);
    }

    bestScore(ids) {
        const scores = ids.map(id => this._scoreOf(id)).filter(score => score !== null);
        return scores.length > 0 ? Math.max(...scores) : null;
    }

    async getInitialResultSet(terms, cancellable) {
        const raw = terms.join(' ').trim();
        const forced = this._services.keyword() === this.id;
        const query = forced ? raw.slice(this.keyword.length).trim() : raw;
        const filter = this._services.filter();
        if (!forced && !this.globalSearch && !matchesFilter(filter, this.category))
            return [];
        if (!forced && query.length < this.manifest.minQueryLength)
            return [];
        let list;
        try {
            list = await this.impl.query({query, raw, forced, terms, filter, cancellable});
        } catch (e) {
            if (!cancellable?.is_cancelled())
                this.api.log('query failed:', e.message ?? e);
            return [];
        }
        if (cancellable?.is_cancelled() || !Array.isArray(list))
            return [];
        this._results.clear();
        const ids = [];
        for (const [index, r] of list.slice(0, MAX_RESULTS).entries()) {
            if (!r || typeof r.title !== 'string' || r.title === '')
                continue;
            const id = `${this.manifest.id}:${r.id ?? index}:${r.title}:${r.subtitle ?? ''}`;
            if (this._results.has(id))
                continue;
            this._results.set(id, r);
            ids.push(id);
        }
        return this._byScore(ids);
    }

    getSubsearchResultSet(_previous, terms, cancellable) {
        return this.getInitialResultSet(terms, cancellable);
    }

    filterResults(results, max) {
        return results.slice(0, max);
    }

    getResultMetas(ids) {
        return Promise.resolve(ids.map(id => {
            const r = this._results.get(id) ?? {title: ''};
            return {
                id,
                name: r.title,
                description: r.subtitle ?? '',
                createIcon: size => Host.iconActor(r.icon ?? this.manifest.icon, size, this.manifest.dir),
            };
        }));
    }

    async _run(result, action) {
        if (action) {
            if (typeof action.run === 'function')
                return action.run();
            if (this._hasEffects(action))
                return Host.applyEffects(this._gsettings, action, this.manifest.dir);
            if (this.impl.activate)
                return Host.applyEffects(this._gsettings, await this.impl.activate(result, action.id), this.manifest.dir);
            return undefined;
        }
        if (typeof result.run === 'function')
            return result.run();
        if (result.activate && typeof result.activate === 'object')
            return Host.applyEffects(this._gsettings, result.activate, this.manifest.dir);
        if (this.impl.activate)
            return Host.applyEffects(this._gsettings, await this.impl.activate(result, null), this.manifest.dir);
        if (result.copy !== undefined)
            return Host.copy(result.copy);
        return undefined;
    }

    _hasEffects(o) {
        return ['copy', 'open', 'exec', 'terminal', 'notify'].some(k => o[k] !== undefined);
    }

    activateResult(id) {
        const result = this._results.get(id);
        if (!result)
            return;
        Promise.resolve(this._run(result, null)).catch(e => this.api.log('activate failed:', e.message ?? e));
    }

    runAction(id, actionId) {
        const result = this._results.get(id);
        const action = result?.actions?.find(a => a.id === actionId);
        if (!action)
            return;
        Promise.resolve(this._run(result, action)).catch(e => this.api.log('action failed:', e.message ?? e));
    }

    preview(id) {
        const result = this._results.get(id);
        if (!result?.preview)
            return null;
        try {
            return typeof result.preview === 'function' ? result.preview() : result.preview;
        } catch (e) {
            this.api.log('preview failed:', e.message ?? e);
            return null;
        }
    }

    destroy() {
        try {
            this.impl?.destroy?.();
        } catch (e) {
            this.api.log('destroy failed:', e.message ?? e);
        }
        this._results.clear();
        this.impl = null;
    }
}
