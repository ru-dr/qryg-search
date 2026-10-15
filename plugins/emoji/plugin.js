// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Emoji from './search.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

const MAX_RESULTS = 30;
const POPULAR = ['😂', '❤️', '👍', '🔥', '😊', '🎉', '🙏', '😭', '✨', '😍', '🤔', '👀'];

function glyph(char) {
    return size => new St.Label({
        text: char,
        style: `font-size: ${Math.round(size * 0.8)}px;`,
        width: size, height: size,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

export default class EmojiPlugin {
    constructor(api) {
        this.api = api;
        this._entries = null;
        this._loading = null;
    }

    _load() {
        this._loading ??= (async () => {
            const file = Gio.File.new_for_path(GLib.build_filenamev([this.api.dir, 'emoji.json']));
            const [bytes] = await file.load_contents_async(null);
            this._entries = Emoji.index(JSON.parse(new TextDecoder().decode(bytes)));
            return this._entries;
        })();
        return this._loading;
    }

    _row(entry, score) {
        const char = Emoji.withTone(entry, this.api.settings.get('skin-tone'));
        const codepoints = Emoji.codepoints(char);
        return {
            id: entry.char,
            title: entry.name,
            subtitle: entry.keywords.slice(0, 6).join(', '),
            icon: glyph(char),
            kind: 'Emoji',
            copy: char,
            activate: {copy: char},
            score,
            actions: [
                {id: 'name', label: 'Copy name', icon: 'edit-copy-symbolic', copy: entry.name},
                {id: 'codepoint', label: 'Copy code point', icon: 'accessories-character-map-symbolic', copy: codepoints},
            ],
            preview: {
                title: char,
                kind: entry.name,
                icon: glyph(char),
                body: entry.keywords.join(', '),
                details: [['Code points', codepoints]],
            },
        };
    }

    async query({query, forced}) {
        const entries = this._entries ?? await this._load();
        if (!query) {
            if (!forced)
                return [];
            return POPULAR.map(c => entries.find(e => e.char === c)).filter(Boolean).map(e => this._row(e));
        }
        return Emoji.search(entries, query, MAX_RESULTS).map(({entry, score}) => this._row(entry, score));
    }
}
