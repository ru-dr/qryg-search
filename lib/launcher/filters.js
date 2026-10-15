// SPDX-License-Identifier: GPL-3.0-or-later
import {FilterMode} from '../results/scope.js';

export const FILTERS = Object.freeze([
    {mode: FilterMode.APPS, icon: 'view-app-grid-symbolic', name: 'Apps', hint: 'Search Apps'},
    {mode: FilterMode.FILES, icon: 'folder-symbolic', name: 'Files', hint: 'Search Files'},
    {mode: FilterMode.ACTIONS, icon: 'system-run-symbolic', name: 'Actions', hint: 'Search Actions'},
    {mode: FilterMode.CLIPBOARD, icon: 'edit-paste-symbolic', name: 'Clipboard', hint: 'Search Clipboard'},
]);

export const EscapeStep = Object.freeze({
    CLEAR_FILTER: 'clear-filter',
    CLEAR_TEXT: 'clear-text',
    CLOSE: 'close',
});

function filterOf(mode) {
    return FILTERS.find(f => f.mode === mode) ?? null;
}

export function filterShortcut(mode) {
    const index = FILTERS.findIndex(f => f.mode === mode);
    return index < 0 ? null : `Super+${index + 1}`;
}

export function filterButtonHint(mode) {
    const filter = filterOf(mode);
    return filter ? `${filter.hint} · ${filterShortcut(mode)}` : null;
}

export function activeFilterHint(mode) {
    const filter = filterOf(mode);
    return filter ? `${filter.hint} · Backspace to clear` : null;
}

export function noResultsText(mode) {
    const filter = filterOf(mode);
    return filter ? `No results in ${filter.name} — press Esc to search everything` : null;
}

export function cycleFilter(available, current, step) {
    const stops = [null, ...available];
    const index = Math.max(0, stops.indexOf(current));
    return stops[(index + step + stops.length) % stops.length];
}

export function escapeStep({filter, text}) {
    if (filter !== null && filter !== undefined)
        return EscapeStep.CLEAR_FILTER;
    if (text)
        return EscapeStep.CLEAR_TEXT;
    return EscapeStep.CLOSE;
}
