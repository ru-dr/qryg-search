// SPDX-License-Identifier: GPL-3.0-or-later
// Runs one query of a JavaScript plugin outside GNOME Shell, for `qryg plugin test`.
// Reads {manifest, query, raw, settings, activate} from the JSON file named in its argument, and prints one marked JSON line.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import System from 'system';
import {fetchJson} from '../../lib/plugins/helpers.js';
import {match} from '../../lib/plugins/match.js';
import {coerce} from '../../lib/plugins/values.js';

const MARKER = 'QRYG_SEARCH_HARNESS ';
const EFFECT_KEYS = ['copy', 'open', 'exec', 'terminal', 'notify'];
const HOME = GLib.get_home_dir();
const MAX_RESULTS = 50;

function readInput() {
    const [, bytes] = GLib.file_get_contents(System.programArgs[0]);
    return JSON.parse(new TextDecoder().decode(bytes));
}

function plain(value) {
    return JSON.parse(JSON.stringify(value ?? null, (_key, v) => {
        if (typeof v === 'function')
            return '[function]';
        if (v instanceof GLib.Variant)
            return v.deepUnpack();
        if (v instanceof GObject.Object)
            return `[${v.constructor.$gtype.name}]`;
        return v;
    }));
}

function hasEffects(o) {
    return Boolean(o) && typeof o === 'object' && EFFECT_KEYS.some(k => o[k] !== undefined && o[k] !== null);
}

function createApi(manifest, values, calls, logs) {
    const dir = kind => {
        const path = GLib.build_filenamev([kind === 'cache' ? GLib.get_user_cache_dir() : GLib.get_user_config_dir(),
            'qryg-search', 'plugins', manifest.id]);
        GLib.mkdir_with_parents(path, 0o755);
        return path;
    };
    const defs = new Map(manifest.settings.map(s => [s.key, s]));
    const record = (name, value) => calls.push([name, value]);
    return {
        id: manifest.id,
        name: manifest.name,
        dir: manifest.dir,
        get cacheDir() {
            return dir('cache');
        },
        get configDir() {
            return dir('config');
        },
        settings: {
            get: key => values[key],
            set: (key, value) => {
                if (defs.has(key))
                    values[key] = coerce(defs.get(key), value);
            },
            all: () => ({...values}),
            onChanged: () => () => {},
        },
        qrygSearchSettings: null,
        copy: text => record('copy', String(text)),
        open: target => record('open', target),
        spawn: argv => record('exec', argv),
        terminal: command => record('terminal', command),
        findTerminal: () => null,
        notify: (title, body = '') => record('notify', `${title} ${body}`.trim()),
        log: (...args) => logs.push(args.map(String).join(' ')),
        refresh: () => record('refresh', true),
        expandPath: path => path.replace(/^~(?=\/|$)/, HOME),
        tildify: path => path === HOME || path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path,
        timeout: (ms, fn) => {
            const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => fn() === true);
            return () => GLib.source_remove(id);
        },
        idle: fn => {
            const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => fn() === true);
            return () => GLib.source_remove(id);
        },
        connect: (object, signal, callback) => {
            const id = object.connect(signal, callback);
            return () => object.disconnect(id);
        },
        fetchJson: (url, options = {}) => fetchJson(url, {...options, cacheDir: options.ttl > 0 ? dir('cache') : null}),
        match,
        services: {refresh: () => record('refresh', true), keyword: () => null, filter: () => null},
    };
}

function withTimeout(promise, ms, cancellable) {
    let timeoutId = 0;
    const expired = new Promise((_resolve, reject) => {
        timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            timeoutId = 0;
            cancellable.cancel();
            reject(new Error(`timed out after ${ms} ms`));
            return GLib.SOURCE_REMOVE;
        });
    });
    return Promise.race([promise, expired]).finally(() => {
        if (timeoutId)
            GLib.source_remove(timeoutId);
    });
}

async function activate(impl, result, calls) {
    if (typeof result.run === 'function')
        return {via: 'the result\'s run() function, not called here', effects: {}};
    if (result.activate && typeof result.activate === 'object')
        return {via: 'the result\'s activate field', effects: result.activate};
    if (typeof impl.activate === 'function') {
        const effects = await impl.activate(result, null);
        if (hasEffects(effects) || calls.length > 0)
            return {via: 'the plugin\'s activate method', effects: effects ?? {}, calls};
    }
    const fallback = result.copy ?? result.path;
    if (fallback !== undefined && fallback !== null && fallback !== '')
        return {via: 'the copy fallback', effects: {copy: fallback}};
    return {via: 'nothing', effects: {}};
}

async function main() {
    const input = readInput();
    const {manifest} = input;
    const calls = [];
    const logs = [];
    const values = {...input.settings};
    const api = createApi(manifest, values, calls, logs);
    const url = GLib.filename_to_uri(GLib.build_filenamev([manifest.dir, manifest.main]), null);
    let impl;
    try {
        const Plugin = (await import(url)).default;
        if (typeof Plugin !== 'function')
            throw new Error(`${manifest.main} has no default export class`);
        impl = new Plugin(api);
    } catch (e) {
        const shell = /resource:\/\/\/org\/gnome\/shell|gi:\/\/(St|Shell|Meta|Clutter)/.test(String(e.message));
        throw new Error(`could not load ${manifest.main}: ${e.message ?? e}${shell ? ' (it needs GNOME Shell, test it there)' : ''}`, {cause: e});
    }
    if (typeof impl.query !== 'function')
        throw new Error('plugin class has no query() method');
    impl.enable?.();
    const cancellable = new Gio.Cancellable();
    const started = GLib.get_monotonic_time();
    const list = await withTimeout(Promise.resolve(impl.query({
        query: input.query, raw: input.raw, forced: true, terms: input.raw.split(/\s+/).filter(Boolean), filter: null, cancellable,
    })), manifest.timeout, cancellable);
    const ms = Math.round((GLib.get_monotonic_time() - started) / 1000);
    const results = Array.isArray(list) ? list.slice(0, MAX_RESULTS).filter(r => r && typeof r.title === 'string' && r.title !== '') : [];
    let activation = null;
    if (input.activate !== null && input.activate !== undefined) {
        if (input.activate < 1 || input.activate > results.length)
            throw new Error(`--activate takes a result number from 1 to ${results.length}`);
        calls.length = 0;
        activation = await activate(impl, results[input.activate - 1], calls);
    }
    try {
        impl.destroy?.();
    } catch {}
    return {results: plain(results), ms, activation: plain(activation), logs};
}

const loop = new GLib.MainLoop(null, false);
let output = null;
GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
    main().then(value => (output = value), e => (output = {error: String(e.message ?? e)})).finally(() => loop.quit());
    return GLib.SOURCE_REMOVE;
});
loop.run();
print(`${MARKER}${JSON.stringify(output)}`);
System.exit(output?.error ? 1 : 0);
