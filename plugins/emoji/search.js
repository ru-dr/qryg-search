// SPDX-License-Identifier: GPL-3.0-or-later
export const TONES = {
    'light': '\u{1F3FB}', 'medium-light': '\u{1F3FC}', 'medium': '\u{1F3FD}', 'medium-dark': '\u{1F3FE}', 'dark': '\u{1F3FF}',
};

const words = text => text.toLowerCase().split(/[\s:,|]+/).filter(Boolean);

export function index(rows) {
    return rows.map(([char, name, keywords, tonable], order) => ({
        char, name, order,
        tonable: tonable === 1,
        keywords: keywords ? keywords.split(' | ') : [],
        nameWords: words(name),
        keywordWords: words(keywords ?? ''),
    }));
}

function wordScore(word, entry) {
    if (entry.nameWords.includes(word))
        return 3;
    if (entry.keywordWords.includes(word))
        return 2;
    if (entry.nameWords.some(w => w.startsWith(word)))
        return 2;
    if (entry.keywordWords.some(w => w.startsWith(word)))
        return 1;
    return 0;
}

export function score(entry, query) {
    const q = query.toLowerCase().trim();
    if (!q)
        return 0;
    if (q === entry.char || q === entry.char.replace(/\uFE0F/g, ''))
        return 100;
    const name = entry.name.toLowerCase();
    if (name === q)
        return 95;
    const parts = words(q);
    let total = 0;
    for (const word of parts) {
        const s = wordScore(word, entry);
        if (s === 0)
            return 0;
        total += s;
    }
    return Math.round(30 + 50 * total / (3 * parts.length) + 10 * q.length / name.length);
}

export function search(entries, query, limit = 50) {
    const found = [];
    for (const entry of entries) {
        const s = score(entry, query);
        if (s > 0)
            found.push({entry, score: s});
    }
    found.sort((a, b) => b.score - a.score ||
        a.entry.nameWords.length - b.entry.nameWords.length || a.entry.order - b.entry.order);
    return found.slice(0, limit);
}

export function withTone(entry, tone) {
    const modifier = TONES[tone];
    if (!modifier || !entry.tonable)
        return entry.char;
    const [first, ...rest] = [...entry.char];
    const tail = rest[0] === '\uFE0F' ? rest.slice(1) : rest;
    return first + modifier + tail.join('');
}

export function codepoints(char) {
    return [...char].map(c => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
}
