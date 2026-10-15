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

const SHORTCUTS = Object.freeze({
    [ActionId.BOOKMARK]: 'Ctrl+D',
    [ActionId.NEW_WINDOW]: 'Ctrl+Enter',
    [ActionId.REVEAL]: 'Ctrl+Shift+E',
    [ActionId.COPY]: 'Ctrl+Shift+C',
});

function label(id, text) {
    return `${text} (${SHORTCUTS[id]})`;
}

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
        const builtIn = Object.values(ActionId).map(id => this._action(info, id)).filter(Boolean);
        return [...this._pluginActions(info), ...builtIn];
    }

    run(info, id) {
        const action = info ? this._action(info, id) : null;
        action?.run();
        return Boolean(action);
    }

    _action(info, id) {
        switch (id) {
        case ActionId.BOOKMARK:
            return this._bookmarkAction(info);
        case ActionId.NEW_WINDOW:
            return info.app?.can_open_new_window() ? {
                id, icon: 'window-new-symbolic', label: label(id, 'New window'),
                run: () => this._finish(() => info.app.open_new_window(-1)),
            } : null;
        case ActionId.REVEAL:
            return info.path ? {
                id, icon: 'folder-open-symbolic', label: label(id, 'Open containing folder'),
                run: () => this._finish(() => revealInFiles(info.path)),
            } : null;
        case ActionId.COPY:
            return info.copyText ? {
                id, icon: 'edit-copy-symbolic', label: label(id, 'Copy'),
                run: () => this._finish(() => copy(info.copyText)),
            } : null;
        default:
            return this._pluginActions(info).find(a => a.id === id) ?? null;
        }
    }

    _pluginActions(info) {
        return info.pluginActions.map(a => ({
            id: `plugin:${a.id}`,
            icon: typeof a.icon === 'string' ? a.icon : 'emblem-system-symbolic',
            label: a.label ?? a.id,
            run: () => this._finish(() => info.provider.runAction(info.id, a.id)),
        }));
    }

    _finish(effect) {
        effect();
        leaveOverview();
        this._close();
    }

    _bookmarkAction(info) {
        const id = ActionId.BOOKMARK;
        if (info.bookmarkName !== null) {
            return {
                id, icon: 'user-trash-symbolic', label: label(id, 'Remove bookmark'),
                run: () => this._toggleBookmark(() => Bookmarks.remove(info.bookmarkName), `Removed bookmark "${info.bookmarkName}"`),
            };
        }
        const target = info.bookmarkTarget;
        if (!target)
            return null;
        const existing = Bookmarks.find(target);
        if (existing) {
            return {
                id, icon: 'starred-symbolic', label: label(id, 'Remove bookmark'),
                run: () => this._toggleBookmark(() => Bookmarks.remove(existing.name), `Removed bookmark "${existing.name}"`),
            };
        }
        return {
            id, icon: 'non-starred-symbolic', label: label(id, 'Bookmark'),
            run: () => this._toggleBookmark(() => Bookmarks.add(target), entry => `Bookmarked "${entry.name}"`),
        };
    }

    _toggleBookmark(change, message) {
        const result = change();
        Main.notify('QryG', typeof message === 'function' ? message(result) : message);
        this._onBookmarksChanged();
    }
}
