// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {PREVIEW_CODE_CHARS, matchWords, relativeTime, truncate} from '../../lib/plugins/text.js';

const COPYOUS_UUID = 'copyous@boerdereinar.dev';
const MAX_RESULTS = 20;
const MAX_TITLE_CHARS = 90;
const TYPE_ICONS = {
    Text: 'edit-paste-symbolic', Code: 'text-x-script-symbolic', Image: 'image-x-generic-symbolic',
    File: 'text-x-generic-symbolic', Files: 'folder-symbolic', Link: 'web-browser-symbolic',
    Character: 'insert-text-symbolic', Color: 'color-select-symbolic',
};

function copyous() {
    const ext = Main.extensionManager.lookup(COPYOUS_UUID);
    return ext?.stateObj?.entryTracker ? ext.stateObj : null;
}

// Copyous has no public way to list its history, so this is the one place that reads its private map.
function historyOf(ext) {
    const map = ext.entryTracker?._entries;
    return typeof map?.values === 'function' ? [...map.values()] : [];
}

function copiedWhen(datetime) {
    return datetime ? relativeTime(Math.min(0, datetime.difference(GLib.DateTime.new_now_utc()) / 1e6)) : '';
}

export default class ClipboardPlugin {
    constructor(api) {
        this.api = api;
    }

    available() {
        return copyous() !== null;
    }

    query({query}) {
        const ext = copyous();
        if (!ext)
            return [];
        return historyOf(ext)
            .map(e => ({e, score: matchWords([e.title, e.content], query)}))
            .filter(({score}) => score !== null)
            .sort((a, b) => (b.e.datetime?.to_unix() ?? 0) - (a.e.datetime?.to_unix() ?? 0))
            .slice(0, MAX_RESULTS)
            .map(({e, score}) => {
                const text = (e.title || e.content || '').replace(/\s+/g, ' ').trim();
                const when = copiedWhen(e.datetime);
                return {
                    id: String(e.id),
                    title: truncate(text, MAX_TITLE_CHARS) || '(empty)',
                    subtitle: [e.type, when].filter(Boolean).join(' · '),
                    icon: TYPE_ICONS[e.type] ?? 'edit-paste-symbolic',
                    kind: e.type ?? 'Clipboard',
                    score: query ? score : undefined,
                    copy: e.content ?? '',
                    run: () => ext.clipboardManager.copyEntry(e).catch(err => this.api.log(err.message)),
                    preview: {kind: e.type ?? 'Clipboard', code: truncate(e.content ?? '', PREVIEW_CODE_CHARS), details: [['Copied', when]]},
                };
            });
    }
}
