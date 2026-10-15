// SPDX-License-Identifier: GPL-3.0-or-later
// No GNOME imports, so it can be tested with node.
import {fold, match} from './match.js';

export const PREVIEW_CODE_CHARS = 600;

const RELATIVE_UNITS = [
    ['year', 365 * 86400], ['month', 30 * 86400], ['week', 7 * 86400], ['day', 86400],
    ['hour', 3600], ['minute', 60], ['second', 1],
];
const JUST_NOW_S = 10;

export function capitalize(text) {
    return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

export function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

// seconds is the time minus now: negative is in the past.
export function relativeTime(seconds) {
    const abs = Math.abs(seconds);
    if (abs < JUST_NOW_S)
        return 'Just now';
    const [unit, size] = RELATIVE_UNITS.find(([, s]) => abs >= s);
    const n = Math.floor(abs / size);
    const text = `${n} ${unit}${n === 1 ? '' : 's'}`;
    return seconds < 0 ? `${text} ago` : `in ${text}`;
}

// Every word must appear somewhere in `fields`. Scores like match(); 0 for an empty query.
export function matchWords(fields, query) {
    const list = (Array.isArray(fields) ? fields : [fields]).map(f => String(f ?? ''));
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return 0;
    const hay = fold(list.join(' '));
    if (!words.every(w => hay.includes(w)))
        return null;
    const best = text => Math.max(...list.map(f => match(f, text) ?? 0));
    return Math.max(best(query), Math.min(...words.map(best)));
}
