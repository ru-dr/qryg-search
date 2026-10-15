// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.Subprocess.prototype, 'wait_async');

const HOME = GLib.get_home_dir();
const TIMEOUT_MS = 2000;
const MAX_CHARS = 6000;
const UNSAFE_CHARS = /[;|&<>`$\\(){}[\]*?=!#%^]/;
const UNSAFE_ARG = /^(-o|--output|--files0-from|--exec|-exec|--config|-c)/;

export default class ShellPlugin {
    constructor(api) {
        this.api = api;
    }

    _argv(command) {
        if (UNSAFE_CHARS.test(command) || /\bsudo\b/.test(command))
            return null;
        let argv;
        try {
            [, argv] = GLib.shell_parse_argv(command);
        } catch {
            return null;
        }
        if (argv.slice(1).some(a => UNSAFE_ARG.test(a)))
            return null;
        const allowed = this.api.settings.get('preview-commands');
        const ok = allowed.some(entry => {
            const parts = entry.split(/\s+/).filter(Boolean);
            return parts.length > 0 && parts.every((p, i) => argv[i] === p);
        });
        if (!ok || !GLib.find_program_in_path(argv[0]))
            return null;
        return argv.map(a => a.replace(/^~(?=\/|$)/, HOME));
    }

    async _capture(argv, cancellable) {
        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE,
        });
        launcher.set_cwd(HOME);
        let proc;
        try {
            proc = launcher.spawnv(argv);
        } catch (e) {
            return {output: e.message, status: -1};
        }
        const stop = new Gio.Cancellable();
        const killId = cancellable?.connect(() => stop.cancel()) ?? 0;
        let timedOut = false;
        let timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMEOUT_MS, () => {
            timeoutId = 0;
            timedOut = true;
            stop.cancel();
            return GLib.SOURCE_REMOVE;
        });
        const stream = proc.get_stdout_pipe();
        const chunks = [];
        let size = 0;
        let truncated = false;
        let finished = false;
        let error = '';
        try {
            for (;;) {
                const bytes = await stream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, stop);
                if (bytes.get_size() === 0) {
                    finished = true;
                    break;
                }
                chunks.push(bytes.toArray());
                size += bytes.get_size();
                if (size >= MAX_CHARS) {
                    truncated = true;
                    break;
                }
            }
        } catch (e) {
            if (!stop.is_cancelled())
                error = e.message;
        } finally {
            if (timeoutId)
                GLib.source_remove(timeoutId);
            if (killId)
                cancellable.disconnect(killId);
            if (!finished)
                proc.force_exit();
            stream.close_async(GLib.PRIORITY_DEFAULT, null, null);
        }
        const all = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            all.set(chunk, offset);
            offset += chunk.length;
        }
        let output = new TextDecoder().decode(all) + error;
        let status = -1;
        if (finished) {
            try {
                await proc.wait_async(null);
                status = proc.get_if_exited() ? proc.get_exit_status() : -1;
            } catch {}
        }
        if (cancellable?.is_cancelled())
            return null;
        if (truncated)
            output = `${output.slice(0, MAX_CHARS)}\n… output cut at ${MAX_CHARS} characters`;
        else if (timedOut)
            output += `\n(stopped after ${TIMEOUT_MS / 1000}s)`;
        return {output, status};
    }

    async query({query, forced, cancellable}) {
        if (!forced || !query)
            return [];
        const shell = GLib.getenv('SHELL') || '/bin/sh';
        const term = this.api.findTerminal();
        const argv = this.api.settings.get('live-preview') ? this._argv(query) : null;
        let live = null;
        if (argv) {
            live = await this._capture(argv, cancellable);
            if (!live)
                return [];
        }
        const output = live ? live.output.replace(/\s+$/, '') : null;
        const first = output?.split('\n').find(l => l.trim()) ?? '';
        const details = [['Runs in', '~']];
        if (live && live.status >= 0)
            details.unshift(['Exit', `${live.status}`]);
        const preview = {
            kind: output !== null ? 'Live output' : 'Shell command',
            code: output ?? 'Not previewed. Only read-only commands from the allowlist run while you type.\n\nEnter runs it in a terminal.',
            details,
        };
        const rows = [{
            id: `term:${first}`,
            title: query,
            subtitle: output !== null ? (first || '(no output)') : `Enter to run in ${term?.name ?? 'a shell'}`,
            icon: 'utilities-terminal-symbolic',
            copy: query,
            bookmark: `> ${query}`,
            activate: {terminal: query},
            preview,
        }];
        if (output)
            rows.push({id: `copy:${first}`, title: 'Copy output', subtitle: `${output.split('\n').length} lines`, icon: 'edit-copy-symbolic', copy: output, activate: {copy: output}, preview});
        rows.push({id: 'bg', title: query, subtitle: 'Run in the background, no window', icon: 'system-run-symbolic', copy: query, bookmark: `> ${query}`, run: () => this.api.spawn([shell, '-c', query], HOME), preview});
        return rows;
    }
}
