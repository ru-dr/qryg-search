// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Bookmarks from '../core/bookmarks.js';
import {leaveOverview} from '../core/overview.js';
import {copy} from '../plugins/host.js';

export const ActionId = Object.freeze({
    BOOKMARK: 'bookmark',
    NEW_WINDOW: 'new-window',
    REVEAL: 'reveal',
    COPY: 'copy',
});

function revealInFiles(path) {
    Gio.DBus.session.call(
        'org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
        'org.freedesktop.FileManager1', 'ShowItems',
        new GLib.Variant('(ass)', [[GLib.filename_to_uri(path, null)], '']),
        null, Gio.DBusCallFlags.NONE, -1, null, null);
}

export class ActionRegistry {
    constructor({close, onBookmarksChanged}) {
        this._close = close;
        this._onBookmarksChanged = onBookmarksChanged;
    }

    forResult(info) {
        const actions = info.pluginActions.map(a => ({
            id: `plugin:${a.id}`,
            icon: typeof a.icon === 'string' ? a.icon : 'emblem-system-symbolic',
            label: a.label ?? a.id,
            run: () => this._finish(() => info.provider.runAction(info.id, a.id)),
        }));
        const bookmark = this._bookmarkAction(info);
        if (bookmark)
            actions.push(bookmark);
        if (info.app?.can_open_new_window()) {
            actions.push({
                id: ActionId.NEW_WINDOW, icon: 'window-new-symbolic', label: 'New window (Ctrl+Enter)',
                run: () => this._finish(() => info.app.open_new_window(-1)),
            });
        }
        if (info.path) {
            actions.push({
                id: ActionId.REVEAL, icon: 'folder-open-symbolic', label: 'Open containing folder (Ctrl+Shift+E)',
                run: () => this._finish(() => revealInFiles(info.path)),
            });
        }
        if (info.copyText) {
            actions.push({
                id: ActionId.COPY, icon: 'edit-copy-symbolic', label: 'Copy (Ctrl+Shift+C)',
                run: () => this._finish(() => copy(info.copyText)),
            });
        }
        return actions;
    }

    run(info, id) {
        const action = info ? this.forResult(info).find(a => a.id === id) : null;
        action?.run();
        return Boolean(action);
    }

    _finish(effect) {
        effect();
        leaveOverview();
        this._close();
    }

    _bookmarkAction(info) {
        if (info.bookmarkName !== null) {
            return {
                id: ActionId.BOOKMARK, icon: 'user-trash-symbolic', label: 'Remove bookmark (Ctrl+D)',
                run: () => this._toggleBookmark(() => Bookmarks.remove(info.bookmarkName), `Removed bookmark "${info.bookmarkName}"`),
            };
        }
        const target = info.bookmarkTarget;
        if (!target)
            return null;
        const existing = Bookmarks.find(target);
        if (existing) {
            return {
                id: ActionId.BOOKMARK, icon: 'starred-symbolic', label: 'Remove bookmark (Ctrl+D)',
                run: () => this._toggleBookmark(() => Bookmarks.remove(existing.name), `Removed bookmark "${existing.name}"`),
            };
        }
        return {
            id: ActionId.BOOKMARK, icon: 'non-starred-symbolic', label: 'Bookmark (Ctrl+D)',
            run: () => this._toggleBookmark(() => Bookmarks.add(target), entry => `Bookmarked "${entry.name}"`),
        };
    }

    _toggleBookmark(change, message) {
        const result = change();
        Main.notify('QryG', typeof message === 'function' ? message(result) : message);
        this._onBookmarksChanged();
    }
}
