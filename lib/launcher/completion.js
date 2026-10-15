// SPDX-License-Identifier: GPL-3.0-or-later
import {kindOf} from '../results/rowStyles.js';

export class Completion {
    constructor(bar) {
        this._bar = bar;
        this.value = null;
    }

    update(row, {entry, enabled}) {
        this.value = null;
        const text = entry.get_text();
        const guide = row?.provider.isGuide?.(row.metaInfo.id);
        if (!enabled || !row || !text || (row.provider.completion === false && !guide)) {
            this._bar.hideGhost();
            return;
        }
        const name = row.metaInfo.name;
        const kind = kindOf(row);
        const typed = text.toLowerCase();
        const lower = name.toLowerCase();
        let ghost;
        if (lower === typed) {
            ghost = kind ? ` — ${kind}` : '';
        } else if (lower.startsWith(typed)) {
            this.value = name;
            ghost = `${name.slice(text.length)} — ${kind}`;
        } else {
            ghost = ` — ${kind ? `${name} (${kind})` : name}`;
        }
        this._bar.showGhost(entry, ghost, kind ? `Top result: ${name}, ${kind}` : `Top result: ${name}`);
    }

    accept(entry) {
        if (this.value === null)
            return false;
        entry.set_text(this.value);
        entry.clutter_text.set_selection(-1, -1);
        return true;
    }

    clear() {
        this.value = null;
        this._bar.hideGhost();
    }
}
