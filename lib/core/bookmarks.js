// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';

export const BOOKMARKS_FILE = GLib.build_filenamev([GLib.get_user_config_dir(), 'qryg-search', 'bookmarks.json']);
const HOME = GLib.get_home_dir();
const TLD = '(?:com|org|net|io|dev|app|co|me|ai|edu|gov|info|xyz|sh|gg|tv|uk|us|in|de|fr|jp|ca|au|eu|page|site|tech|so|to|fm|ly|rs)';
export const URL_LIKE = new RegExp(`^(https?:\\/\\/\\S+|(?:www\\.)?(?:[a-z0-9-]+\\.)+${TLD}(?::\\d+)?(?:\\/\\S*)?|localhost:\\d+(?:\\/\\S*)?)$`, 'i');
const URI = /^[a-z][a-z0-9+.-]*:\/\//i;

export function expandPath(target) {
    const t = target.startsWith('file://') ? GLib.filename_from_uri(target)[0] : target;
    return t.replace(/^~(?=\/|$)/, HOME);
}

export function tildify(path) {
    return path === HOME || path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path;
}

export function kindOf(target) {
    if (target.startsWith('>'))
        return 'command';
    if (/^https?:\/\//i.test(target) || (URL_LIKE.test(target) && !GLib.file_test(expandPath(target), GLib.FileTest.EXISTS)))
        return 'site';
    if (URI.test(target) && !target.startsWith('file://'))
        return 'location';
    return GLib.file_test(expandPath(target), GLib.FileTest.IS_DIR) ? 'folder' : 'file';
}

export function defaultName(target) {
    const kind = kindOf(target);
    if (kind === 'command')
        return target.replace(/^>\s*/, '').split(/\s+/).slice(0, 3).join(' ');
    if (kind === 'site' || kind === 'location') {
        const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/:?#]+)/i.exec(target);
        return (m?.[1] ?? target).replace(/^www\./, '');
    }
    const base = GLib.path_get_basename(expandPath(target));
    return base && base !== '/' ? base : target;
}

export function normalizeTarget(target) {
    const t = target.trim();
    if (t.startsWith('>'))
        return `> ${t.replace(/^>\s*/, '')}`;
    if (URI.test(t) && !t.startsWith('file://'))
        return t;
    if (t.startsWith('/') || t.startsWith('~') || t.startsWith('file://'))
        return tildify(expandPath(t));
    return t;
}

export function load() {
    try {
        const [, bytes] = GLib.file_get_contents(BOOKMARKS_FILE);
        const list = JSON.parse(new TextDecoder().decode(bytes));
        return Array.isArray(list) ? list.filter(b => b?.name && b?.target) : [];
    } catch {
        return [];
    }
}

export function save(list) {
    GLib.mkdir_with_parents(GLib.path_get_dirname(BOOKMARKS_FILE), 0o755);
    GLib.file_set_contents(BOOKMARKS_FILE, `${JSON.stringify(list, null, 2)}\n`);
}

export function find(target) {
    const t = normalizeTarget(target);
    return load().find(b => normalizeTarget(b.target) === t) ?? null;
}

export function add(target, name = '') {
    const t = normalizeTarget(target);
    const entry = {name: name.trim() || defaultName(t), target: t, type: kindOf(t)};
    const list = load().filter(b => b.name !== entry.name && normalizeTarget(b.target) !== t);
    list.push(entry);
    save(list);
    return entry;
}

export function remove(name) {
    const list = load();
    const left = list.filter(b => b.name !== name);
    if (left.length !== list.length)
        save(left);
    return left.length !== list.length;
}

export function parseAddCommand(text) {
    const q = text.trim();
    if (!q)
        return null;
    const cmd = q.indexOf('>');
    if (cmd >= 0) {
        const command = q.slice(cmd).trim();
        return command.length > 1 ? {name: q.slice(0, cmd).trim(), target: command} : null;
    }
    const parts = q.split(/\s+/);
    const path = parts.findIndex(p => /^(~|\/|file:\/\/)/.test(p));
    if (path >= 0)
        return {name: parts.slice(0, path).join(' '), target: parts.slice(path).join(' ')};
    const last = parts[parts.length - 1];
    if (URI.test(last) || URL_LIKE.test(last))
        return {name: parts.slice(0, -1).join(' '), target: last};
    return null;
}
