// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {MAX_OUTPUT, TimeoutError, spawnScript} from './script.js';

Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async');

const MAX_STARTS = 3;
const MAX_TIMEOUTS = 3;
const START_WINDOW_US = 60 * GLib.USEC_PER_SEC;

export class ScriptServer {
    constructor(manifest, {onRefresh, onError, log}) {
        this._manifest = manifest;
        this._onRefresh = onRefresh;
        this._onError = onError;
        this._log = log;
        this._proc = null;
        this._ready = false;
        this._stdin = null;
        this._stop = null;
        this._writing = Promise.resolve();
        this._pending = new Map();
        this._nextId = 1;
        this._starts = [];
        this._failed = false;
        this._dead = false;
        this._timeouts = 0;
    }

    request(method, payload, cancellable) {
        if (cancellable?.is_cancelled())
            return Promise.resolve(null);
        this._ensureRunning();
        const id = this._nextId++;
        const line = `${JSON.stringify({id, method, ...payload})}\n`;
        return new Promise((resolve, reject) => {
            const entry = {resolve, reject, cancellable, cancelId: 0, timeoutId: 0};
            this._pending.set(id, entry);
            // Until the process says it is ready, allow for its startup on top of the request time.
            const timeout = this._manifest.timeout + (this._ready ? 0 : this._manifest.startupTimeout);
            entry.timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () => {
                entry.timeoutId = 0;
                this._settle(id, {error: new TimeoutError(`timed out after ${timeout} ms`)});
                this._onTimeout();
                return GLib.SOURCE_REMOVE;
            });
            if (cancellable)
                entry.cancelId = cancellable.connect(() => this._settle(id, {value: null, fromCancel: true}));
            this._write(line).catch(error => this._settle(id, {error}));
        });
    }

    stop() {
        this._kill(null);
        this._starts = [];
        this._failed = false;
    }

    destroy() {
        this.stop();
        this._dead = true;
    }

    _kill(error) {
        this._stop?.cancel();
        this._proc?.force_exit();
        this._proc = null;
        this._stdin = null;
        this._timeouts = 0;
        this._settleAll(error);
    }

    // A server that stops answering is ended, so the next request starts a new one.
    _onTimeout() {
        if (++this._timeouts < MAX_TIMEOUTS || !this._proc)
            return;
        this._log(`no reply to ${MAX_TIMEOUTS} requests in a row; restarting it`);
        this._kill(new Error('the plugin process stopped answering'));
    }

    _ensureRunning() {
        if (this._dead)
            throw new Error('the plugin was unloaded');
        if (this._proc)
            return;
        if (this._failed)
            throw new Error('stopped after crashing repeatedly; reload plugins to retry');
        const now = GLib.get_monotonic_time();
        this._starts = this._starts.filter(t => now - t < START_WINDOW_US);
        if (this._starts.length >= MAX_STARTS) {
            this._failed = true;
            throw new Error('stopped after crashing repeatedly; reload plugins to retry');
        }
        this._starts.push(now);
        const proc = spawnScript(this._manifest, 'serve');
        this._proc = proc;
        this._ready = false;
        this._stdin = proc.get_stdin_pipe();
        this._stop = new Gio.Cancellable();
        this._writing = Promise.resolve();
        const stdout = new Gio.DataInputStream({base_stream: proc.get_stdout_pipe(), close_base_stream: true});
        this._readLoop(proc, stdout, this._stop);
    }

    _write(line) {
        const stdin = this._stdin;
        const stop = this._stop;
        const bytes = new GLib.Bytes(new TextEncoder().encode(line));
        this._writing = this._writing.catch(() => {})
            .then(() => stdin.write_bytes_async(bytes, GLib.PRIORITY_DEFAULT, stop));
        return this._writing;
    }

    async _readLoop(proc, stdout, stop) {
        try {
            for (;;) {
                const [bytes] = await stdout.read_line_async(GLib.PRIORITY_DEFAULT, stop);
                if (bytes === null)
                    break;
                const line = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
                if (line.length > MAX_OUTPUT)
                    throw new Error(`a reply was larger than ${MAX_OUTPUT / 1024} KB`);
                this._onLine(line);
            }
        } catch (e) {
            if (!stop.is_cancelled())
                this._log('server error:', e.message ?? e);
        }
        if (this._proc === proc)
            this._kill(new Error('the plugin process exited'));
    }

    _onLine(line) {
        if (!line.trim())
            return;
        this._ready = true;
        let message;
        try {
            message = JSON.parse(line);
        } catch {
            this._log('invalid JSON line:', line.slice(0, 120));
            return;
        }
        if (message?.method === 'refresh')
            this._onRefresh();
        else if (message?.method === 'log')
            this._log(String(message.message ?? ''));
        else if (message?.method === 'error')
            this._onError(String(message.message ?? 'unknown error'));
        else if (this._pending.has(message?.id)) {
            this._timeouts = 0;
            this._settle(message.id, {value: message});
        }
    }

    _settle(id, {value = null, error = null, fromCancel = false}) {
        const entry = this._pending.get(id);
        if (!entry)
            return;
        this._pending.delete(id);
        if (entry.timeoutId)
            GLib.source_remove(entry.timeoutId);
        if (entry.cancelId && !fromCancel)
            entry.cancellable.disconnect(entry.cancelId);
        if (error)
            entry.reject(error);
        else
            entry.resolve(value);
    }

    _settleAll(error) {
        for (const id of [...this._pending.keys()])
            this._settle(id, error ? {error} : {value: null});
    }
}
