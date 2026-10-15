// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Host from './host.js';
import {providerId} from './manifest.js';
import {exampleText, guideRows, isWordKeyword} from './guide.js';
import {Tracker, createApi} from './api.js';
import {TimeoutError, runScript} from './script.js';
import {ScriptServer} from './server.js';

const MAX_RESULTS = 50;
let loadCount = 0;

function matchesFilter(filter, category) {
    return filter !== null && filter === category;
}

class ScriptImpl {
    constructor(manifest, api, onError) {
        this._manifest = manifest;
        this._api = api;
        this._server = manifest.persistent
            ? new ScriptServer(manifest, {onRefresh: () => api.refresh(), onError, log: (...args) => api.log(...args)})
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

    disable() {
        this._server?.stop();
    }

    destroy() {
        this._server?.destroy();
    }
}

function withTimeout(promise, ms, cancellable) {
    let timeoutId = 0;
    const expired = new Promise((_resolve, reject) => {
        timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            timeoutId = 0;
            cancellable.cancel();
            reject(new TimeoutError(`timed out after ${ms} ms`));
            return GLib.SOURCE_REMOVE;
        });
    });
    return Promise.race([promise, expired]).finally(() => {
        if (timeoutId)
            GLib.source_remove(timeoutId);
    });
}

export class PluginProvider {
    constructor(manifest, gsettings, services, onStatus = () => {}) {
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
        this._guide = new Map();
        this._onStatus = onStatus;
        this._tracker = new Tracker();
        this._active = false;
        this.stats = {lastError: null, errors: 0, timeouts: 0, lastMs: null, at: 0};
        this.api = createApi(manifest, gsettings, services, this._tracker);
        this.impl = null;
    }

    async load() {
        if (this.manifest.type === 'script') {
            this.impl = new ScriptImpl(this.manifest, this.api, message => this._recordError(message));
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

    setActive(active) {
        if (!this.impl || active === this._active)
            return;
        this._active = active;
        try {
            if (active)
                this.impl.enable?.();
            else
                this.impl.disable?.();
        } catch (e) {
            this._recordError(`${active ? 'enable' : 'disable'} failed: ${e.message ?? e}`);
        }
    }

    _recordError(message, timedOut = false) {
        this.stats.errors++;
        if (timedOut)
            this.stats.timeouts++;
        this.stats.lastError = message;
        this.stats.at = Math.floor(Date.now() / 1000);
        this.api.log(message);
        this._onStatus();
    }

    _query(ctx, cancellable) {
        if (this.manifest.type === 'script')
            return this.impl.query({...ctx, cancellable});
        const child = new Gio.Cancellable();
        const linkId = cancellable?.connect(() => child.cancel()) ?? 0;
        let promise;
        try {
            promise = Promise.resolve(this.impl.query({...ctx, cancellable: child}));
        } catch (e) {
            promise = Promise.reject(e);
        }
        return withTimeout(promise, this.manifest.timeout, child).finally(() => {
            if (linkId)
                cancellable.disconnect(linkId);
        });
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
        const started = GLib.get_monotonic_time();
        try {
            list = await this._query({query, raw, forced, terms, filter}, cancellable);
        } catch (e) {
            if (!cancellable?.is_cancelled())
                this._recordError(`query failed: ${e.message ?? e}`, e instanceof TimeoutError);
            return [];
        }
        this.stats.lastMs = Math.round((GLib.get_monotonic_time() - started) / 1000);
        if (cancellable?.is_cancelled() || !Array.isArray(list))
            return [];
        this._results.clear();
        this._guide.clear();
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
        if (forced && ids.length === 0)
            return this._guideResults(query);
        return this._byScore(ids);
    }

    // With the prefix typed and nothing to show, the manifest examples teach the plugin. Enter or Tab fills one in.
    _guideResults(query) {
        const {examples, name, icon, description} = this.manifest;
        const all = examples.map(e => [exampleText(this.keyword, e.query), e.description]);
        return guideRows(this.keyword, examples, query).map((row, index) => {
            const id = `${this.manifest.id}:guide:${index}:${row.title}`;
            this._guide.set(id, row.title);
            this._results.set(id, {
                ...row,
                icon,
                kind: 'Example',
                preview: {title: name, kind: 'How to use', icon, body: description, examples: all, current: row.title},
            });
            return id;
        });
    }

    isGuide(id) {
        return this._guide.has(id);
    }

    fillGuide(id) {
        const text = this._guide.get(id);
        if (text !== undefined)
            this._services.setQuery?.(isWordKeyword(this.keyword) && text === this.keyword ? `${text} ` : text);
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
        if (this.impl.activate) {
            const effects = await this.impl.activate(result, null);
            if (this._hasEffects(effects))
                return Host.applyEffects(this._gsettings, effects, this.manifest.dir);
        }
        const fallback = result.copy ?? result.path;
        if (fallback !== undefined && fallback !== null && fallback !== '')
            return Host.copy(fallback);
        return undefined;
    }

    _hasEffects(o) {
        return Boolean(o) && typeof o === 'object' &&
            ['copy', 'open', 'exec', 'terminal', 'notify'].some(k => o[k] !== undefined && o[k] !== null);
    }

    activateResult(id) {
        const result = this._results.get(id);
        if (!result)
            return;
        Promise.resolve(this._run(result, null)).catch(e => this._recordError(`activate failed: ${e.message ?? e}`));
    }

    runAction(id, actionId) {
        const result = this._results.get(id);
        const action = result?.actions?.find(a => a.id === actionId);
        if (!action)
            return;
        Promise.resolve(this._run(result, action)).catch(e => this._recordError(`action failed: ${e.message ?? e}`));
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
        this._tracker.clear();
        this._results.clear();
        this.impl = null;
    }
}
