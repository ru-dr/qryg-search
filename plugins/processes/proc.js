// SPDX-License-Identifier: GPL-3.0-or-later
// Parsing /proc and matching processes. No GNOME imports, so it can be tested with node.

// Killing one of these ends or breaks the session, so they are never listed.
const PROTECTED = [
    /^gnome-shell/, /^gnome-session/, /^systemd/, /^\(sd-pam\)$/, /^dbus-daemon$/, /^dbus-broker/,
    /^xwayland$/i, /^pipewire/, /^wireplumber$/, /^gdm/, /^mutter/, /^gnome-keyring-d/,
];

export function parseStatus(text) {
    const fields = {};
    for (const line of text.split('\n')) {
        const i = line.indexOf(':');
        if (i > 0)
            fields[line.slice(0, i)] = line.slice(i + 1).trim();
    }
    if (!fields.Pid)
        return null;
    return {
        name: fields.Name ?? '',
        pid: Number(fields.Pid),
        ppid: Number(fields.PPid ?? 0),
        uid: Number((fields.Uid ?? '').split(/\s+/)[0]),
        state: (fields.State ?? '').charAt(0),
        rssKb: Number.parseInt(fields.VmRSS ?? '0', 10) || 0,
        threads: Number(fields.Threads ?? 1),
    };
}

// The start time field of /proc/<pid>/stat, in clock ticks since boot. Tells a process from a later one with the same pid.
export function parseStartTime(text) {
    const end = text.lastIndexOf(')');
    if (end < 0)
        return null;
    const fields = text.slice(end + 2).trim().split(/\s+/);
    const value = Number(fields[19]);
    return Number.isFinite(value) ? value : null;
}

export function parseCmdline(text) {
    return text.split('\0').filter(Boolean);
}

// GNOME Shell also runs helper services, such as notifications and screencasts, as gjs scripts.
const SHELL_HELPER = /\/gnome-shell\/|^org\.gnome\.Shell\./;

export function isProtected(name, argv = []) {
    const base = argv[0] ? argv[0].split('/').pop() : '';
    return PROTECTED.some(re => re.test(name) || (base && re.test(base))) || argv.some(a => SHELL_HELPER.test(a));
}

// The kernel cuts process names to 15 characters, so prefer the program name when it is the longer form.
export function displayName(proc) {
    const exe = proc.argv[0] ? proc.argv[0].split('/').pop() : '';
    return proc.name.length === 15 && exe.startsWith(proc.name) ? exe : proc.name;
}

export function formatMemory(kb) {
    if (kb >= 1024 * 1024)
        return `${(kb / 1024 / 1024).toFixed(1)} GB`;
    if (kb >= 1024)
        return `${Math.round(kb / 1024)} MB`;
    return `${kb} KB`;
}

// A process is {name, pid, argv, ...}. Returns 0 when it does not match.
export function score(proc, query) {
    const q = query.toLowerCase().trim();
    if (!q)
        return 1;
    if (/^\d+$/.test(q))
        return String(proc.pid) === q ? 100 : 0;
    const name = proc.name.toLowerCase();
    const exe = (proc.argv[0] ?? '').split('/').pop().toLowerCase();
    const command = proc.argv.join(' ').toLowerCase();
    if (name === q)
        return 95;
    if (exe === q)
        return 90;
    if (name.startsWith(q))
        return 80;
    if (exe.startsWith(q))
        return 75;
    if (name.includes(q) || exe.includes(q))
        return 60;
    const words = q.split(/\s+/);
    return words.every(w => command.includes(w)) ? 35 : 0;
}

export function rank(procs, query, limit) {
    return procs
        .map(proc => ({proc, score: score(proc, query)}))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.proc.rssKb - a.proc.rssKb || a.proc.pid - b.proc.pid)
        .slice(0, limit);
}
