// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import * as Bookmarks from '../../lib/core/bookmarks.js';

const ICONS = {
    command: 'utilities-terminal-symbolic',
    site: 'web-browser-symbolic',
    location: 'folder-remote-symbolic',
    folder: 'folder-symbolic',
    file: 'text-x-generic-symbolic',
};

export default class BookmarksPlugin {
    constructor(api) {
        this.api = api;
        this._stamp = null;
        this._list = [];
    }

    _bookmarks() {
        let stamp = 'missing';
        try {
            const info = Gio.File.new_for_path(Bookmarks.BOOKMARKS_FILE)
                .query_info('time::modified,time::modified-usec,standard::size', Gio.FileQueryInfoFlags.NONE, null);
            stamp = `${info.get_attribute_uint64('time::modified')}.${info.get_attribute_uint32('time::modified-usec')}.${info.get_size()}`;
        } catch {}
        if (stamp !== this._stamp) {
            this._stamp = stamp;
            this._list = Bookmarks.load();
        }
        return this._list;
    }

    _addRow(text) {
        const parsed = Bookmarks.parseAddCommand(text);
        if (!parsed) {
            return [{
                id: 'help', title: 'Add a bookmark', icon: 'list-add-symbolic',
                subtitle: 'Type a path, URL, sftp:// location or "> command", optionally after a name',
            }];
        }
        const target = Bookmarks.normalizeTarget(parsed.target);
        const name = parsed.name || Bookmarks.defaultName(target);
        const kind = Bookmarks.kindOf(target);
        const exists = Bookmarks.find(target);
        return [{
            id: 'add',
            title: `Add "${name}"`,
            subtitle: `${exists ? `Replaces "${exists.name}" · ` : ''}${kind} bookmark · ${target}`,
            icon: 'list-add-symbolic',
            run: () => {
                const entry = Bookmarks.add(target, name);
                this.api.notify('QryG', `Bookmarked "${entry.name}"`);
            },
            preview: {kind: `New ${kind} bookmark`, details: [['Name', name], ['Target', target]]},
        }];
    }

    query({query, forced}) {
        if (forced && query.startsWith('+'))
            return this._addRow(query.slice(1));
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!forced && words.length === 0)
            return [];
        const rows = [];
        for (const b of this._bookmarks()) {
            const hay = `${b.name} ${b.target} ${(b.tags ?? []).join(' ')}`.toLowerCase();
            if (!words.every(w => hay.includes(w)))
                continue;
            const kind = b.type ?? Bookmarks.kindOf(b.target);
            const target = b.target;
            let activate;
            if (kind === 'command')
                activate = {terminal: target.replace(/^>\s*/, '')};
            else if (kind === 'site')
                activate = {open: /^https?:\/\//i.test(target) ? target : `https://${target}`};
            else
                activate = {open: target};
            rows.push({
                id: b.name,
                title: b.name,
                subtitle: `${kind[0].toUpperCase()}${kind.slice(1)} bookmark · ${target}`,
                icon: ICONS[kind] ?? 'user-bookmarks-symbolic',
                kind: `${kind[0].toUpperCase()}${kind.slice(1)} bookmark`,
                copy: target.replace(/^>\s*/, ''),
                path: kind === 'file' || kind === 'folder' ? Bookmarks.expandPath(target) : undefined,
                bookmarkName: b.name,
                activate,
                preview: {kind: `${kind} bookmark`, details: [['Target', target], ...(b.tags?.length ? [['Tags', b.tags.join(', ')]] : [])]},
                starts: b.name.toLowerCase().startsWith(words[0] ?? ''),
            });
        }
        rows.sort((a, b) => Number(b.starts) - Number(a.starts));
        if (forced && rows.length === 0 && query)
            return this._addRow(query);
        return rows;
    }
}
