// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as P from './proc.js';
import {readText} from '../../lib/plugins/helpers.js';
import {PREVIEW_CODE_CHARS, truncate} from '../../lib/plugins/text.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.Subprocess.prototype, 'wait_check_async');

const ICON = 'application-x-executable-symbolic';
const MAX_RESULTS = 30;
const SNAPSHOT_US = 2 * 1000 * 1000;

export default class ProcessesPlugin {
    constructor(api) {
        this.api = api;
        this._snapshot = null;
        this._takenAt = 0;
        const info = Gio.File.new_for_path('/proc/self').query_info('unix::uid', Gio.FileQueryInfoFlags.NONE, null);
        this._uid = info.get_attribute_uint32('unix::uid');
        this._self = Number(GLib.file_read_link('/proc/self'));
    }

    async _pids(cancellable) {
        const dir = Gio.File.new_for_path('/proc');
        const it = await dir.enumerate_children_async('standard::name,unix::uid',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, GLib.PRIORITY_DEFAULT, cancellable);
        const pids = [];
        for (;;) {
            const infos = await it.next_files_async(256, GLib.PRIORITY_DEFAULT, cancellable);
            if (infos.length === 0)
                break;
            for (const info of infos) {
                const name = info.get_name();
                if (/^\d+$/.test(name) && info.get_attribute_uint32('unix::uid') === this._uid)
                    pids.push(Number(name));
            }
        }
        it.close(null);
        return pids;
    }

    async _read(pid, cancellable) {
        const base = `/proc/${pid}`;
        const [status, cmdline, stat] = await Promise.all(
            ['status', 'cmdline', 'stat'].map(f => readText(`${base}/${f}`, cancellable)));
        const proc = P.parseStatus(status);
        const argv = P.parseCmdline(cmdline);
        // Kernel threads have no command line, and zombies are already gone.
        if (!proc || proc.uid !== this._uid || argv.length === 0 || proc.state === 'Z')
            return null;
        if (proc.pid === this._self || P.isProtected(proc.name, argv))
            return null;
        return {...proc, argv, start: P.parseStartTime(stat)};
    }

    async _list(cancellable) {
        const now = GLib.get_monotonic_time();
        if (this._snapshot && now - this._takenAt < SNAPSHOT_US)
            return this._snapshot;
        const pids = await this._pids(cancellable);
        const procs = (await Promise.all(pids.map(pid => this._read(pid, cancellable)))).filter(Boolean);
        if (cancellable?.is_cancelled())
            return [];
        this._snapshot = procs;
        this._takenAt = now;
        return procs;
    }

    async _kill(proc, signal) {
        const label = `${proc.name} (${proc.pid})`;
        const start = P.parseStartTime(await readText(`/proc/${proc.pid}/stat`, null));
        if (start === null || start !== proc.start) {
            this.api.notify(`${label} is no longer running`, 'Nothing was sent.');
            return;
        }
        this._snapshot = null;
        try {
            const sub = Gio.Subprocess.new(['kill', '-s', signal, `${proc.pid}`], Gio.SubprocessFlags.STDERR_SILENCE);
            await sub.wait_check_async(null);
            this.api.notify(signal === 'KILL' ? `Force killed ${label}` : `Asked ${label} to quit`,
                `Sent SIG${signal}.`);
        } catch (e) {
            this.api.notify(`Could not stop ${label}`, e.message);
        }
    }

    _row(proc, score) {
        const command = proc.argv.join(' ');
        const memory = P.formatMemory(proc.rssKb);
        const app = Shell.WindowTracker.get_default().get_app_from_pid(proc.pid);
        const name = P.displayName(proc);
        return {
            id: `${proc.pid}`,
            title: name,
            subtitle: [`PID ${proc.pid}`, memory, app?.get_name()].filter(Boolean).join(' · '),
            icon: app ? {app: app.get_id()} : ICON,
            kind: 'Process',
            score,
            copy: `${proc.pid}`,
            run: () => this._kill(proc, 'TERM'),
            actions: [
                {id: 'force', label: 'Force kill (SIGKILL)', icon: 'process-stop-symbolic', run: () => this._kill(proc, 'KILL')},
                {id: 'pid', label: 'Copy PID', icon: 'edit-copy-symbolic', copy: `${proc.pid}`},
            ],
            preview: {
                title: name,
                kind: 'Process',
                icon: app ? {app: app.get_id()} : ICON,
                body: 'Enter sends SIGTERM, which asks it to quit and save its work. Force kill sends SIGKILL, which ends it at once.',
                code: truncate(command, PREVIEW_CODE_CHARS),
                details: [['PID', `${proc.pid}`], ['Parent', `${proc.ppid}`], ['Memory', memory], ['Threads', `${proc.threads}`]],
            },
        };
    }

    async query({query, cancellable}) {
        const procs = await this._list(cancellable);
        return P.rank(procs, query, MAX_RESULTS).map(({proc, score}) => this._row(proc, query ? score : undefined));
    }
}
