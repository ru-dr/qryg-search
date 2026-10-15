// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {hasCommand} from './rules.js';

Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async');
Gio._promisify(Gio.Subprocess.prototype, 'wait_async');

export const MAX_OUTPUT = 512 * 1024;
const STDERR_TAIL = 4096;

export class TimeoutError extends Error {}

function commandFor(manifest) {
    if (hasCommand(manifest))
        return manifest.command.map(String);
    return [GLib.build_filenamev([manifest.dir, manifest.main])];
}

export function pluginDirs(manifest) {
    const cache = GLib.build_filenamev([GLib.get_user_cache_dir(), 'qryg-search', 'plugins', manifest.id]);
    const config = GLib.build_filenamev([GLib.get_user_config_dir(), 'qryg-search', 'plugins', manifest.id]);
    return {cache, config};
}

// A one-shot script pipes its stderr, so a crash can be reported; a server's stderr is dropped.
export function spawnScript(manifest, mode, {stderr = false} = {}) {
    const {cache, config} = pluginDirs(manifest);
    const launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE |
            (stderr ? Gio.SubprocessFlags.STDERR_PIPE : Gio.SubprocessFlags.STDERR_SILENCE),
    });
    GLib.mkdir_with_parents(cache, 0o755);
    GLib.mkdir_with_parents(config, 0o755);
    launcher.set_cwd(manifest.dir);
    launcher.setenv('QRYG_SEARCH_PLUGIN_ID', manifest.id, true);
    launcher.setenv('QRYG_SEARCH_PLUGIN_DIR', manifest.dir, true);
    launcher.setenv('QRYG_SEARCH_CACHE_DIR', cache, true);
    launcher.setenv('QRYG_SEARCH_CONFIG_DIR', config, true);
    return launcher.spawnv([...commandFor(manifest), mode]);
}

async function readTail(stream, stop) {
    let tail = new Uint8Array(0);
    try {
        for (;;) {
            const bytes = await stream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, stop);
            if (bytes.get_size() === 0)
                break;
            const joined = new Uint8Array(tail.length + bytes.get_size());
            joined.set(tail);
            joined.set(bytes.toArray(), tail.length);
            tail = joined.slice(-STDERR_TAIL);
        }
    } catch {}
    return new TextDecoder().decode(tail);
}

function exitError(proc, stderr) {
    const reason = proc.get_if_exited() ? `exit ${proc.get_exit_status()}` : `killed by signal ${proc.get_term_sig()}`;
    const last = stderr.trim().split('\n').at(-1);
    return new Error(last ? `${reason}: ${last}` : reason);
}

export async function runScript(manifest, method, payload, cancellable) {
    const proc = spawnScript(manifest, method, {stderr: true});

    const stop = new Gio.Cancellable();
    const killId = cancellable?.connect(() => stop.cancel()) ?? 0;
    let timedOut = false;
    let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, manifest.timeout, () => {
        timeoutId = 0;
        timedOut = true;
        stop.cancel();
        return GLib.SOURCE_REMOVE;
    });

    const chunks = [];
    let size = 0;
    let finished = false;
    let failure = null;
    const stderr = readTail(proc.get_stderr_pipe(), stop);
    try {
        const stdin = proc.get_stdin_pipe();
        const input = new TextEncoder().encode(`${JSON.stringify({method, ...payload})}\n`);
        await stdin.write_bytes_async(new GLib.Bytes(input), GLib.PRIORITY_DEFAULT, stop);
        stdin.close(null);
        const stdout = proc.get_stdout_pipe();
        for (;;) {
            const bytes = await stdout.read_bytes_async(16384, GLib.PRIORITY_DEFAULT, stop);
            if (bytes.get_size() === 0)
                break;
            chunks.push(bytes.toArray());
            size += bytes.get_size();
            if (size > MAX_OUTPUT)
                throw new Error(`output larger than ${MAX_OUTPUT / 1024} KB`);
        }
        await proc.wait_async(stop);
        finished = true;
        if (!proc.get_successful())
            failure = exitError(proc, await stderr);
    } catch (e) {
        if (!stop.is_cancelled())
            throw e;
    } finally {
        if (timeoutId)
            GLib.source_remove(timeoutId);
        if (killId)
            cancellable.disconnect(killId);
        if (!finished)
            proc.force_exit();
        stop.cancel();
    }
    if (cancellable?.is_cancelled())
        return null;
    if (timedOut)
        throw new TimeoutError(`timed out after ${manifest.timeout} ms`);
    if (failure)
        throw failure;

    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
    }
    const text = new TextDecoder().decode(all).trim();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`invalid JSON on stdout: ${text.slice(0, 120)}`);
    }
}
