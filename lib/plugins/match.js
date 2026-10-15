// SPDX-License-Identifier: GPL-3.0-or-later

export function fold(text) {
    return String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function isWordStart(text, index) {
    return index === 0 || !/[\p{L}\p{N}]/u.test(text[index - 1]);
}

function atWordStart(text, query) {
    for (let i = text.indexOf(query); i >= 0; i = text.indexOf(query, i + 1)) {
        if (isWordStart(text, i))
            return true;
    }
    return false;
}

function subsequence(text, letters) {
    let first = -1;
    let last = -1;
    let starts = 0;
    for (const char of letters) {
        const i = text.indexOf(char, last + 1);
        if (i < 0)
            return null;
        if (first < 0)
            first = i;
        if (isWordStart(text, i))
            starts++;
        last = i;
    }
    return {span: last - first + 1, starts};
}

// 100 exact, 80-90 prefix, 60-75 word start, 40-55 inside a word, 10-35 scattered letters, null no match.
export function match(text, query) {
    const t = fold(text);
    const q = fold(query).trim();
    if (!q)
        return 0;
    if (t === q)
        return 100;
    const ratio = q.length / Math.max(t.length, 1);
    if (t.startsWith(q))
        return Math.round(80 + 10 * ratio);
    if (atWordStart(t, q))
        return Math.round(60 + 15 * ratio);
    if (t.includes(q))
        return Math.round(40 + 15 * ratio);
    const letters = [...q.replace(/\s+/g, '')];
    const found = subsequence(t, letters);
    if (!found)
        return null;
    return Math.round(10 + 15 * letters.length / found.span + 10 * found.starts / letters.length);
}
