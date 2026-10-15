// SPDX-License-Identifier: GPL-3.0-or-later
// Plain JavaScript, so node can test it.
// cli/qryg_search/manifest.py does the same for the command line: keep them in step.

export const MAX_EXAMPLES = 10;

export function isValidKeyword(keyword) {
    return typeof keyword === 'string' && /^\S{1,12}$/u.test(keyword);
}

export function isWordKeyword(keyword) {
    return typeof keyword === 'string' && /^[\p{L}\p{N}]/u.test(keyword);
}

export function exampleText(keyword, query) {
    const q = query.trim();
    if (!keyword)
        return q;
    return isWordKeyword(keyword) ? `${keyword} ${q}`.trimEnd() : `${keyword}${q}`;
}

export function guideProblems(manifest) {
    const found = [];
    if (manifest.keyword === undefined || manifest.keyword === null || manifest.keyword === '')
        found.push('keyword is required: the prefix that limits the search to this plugin, such as "wx"');
    else if (!isValidKeyword(manifest.keyword))
        found.push('keyword must be 1 to 12 characters without spaces, such as ">" or "calc"');
    const {examples} = manifest;
    if (!Array.isArray(examples) || examples.length === 0) {
        found.push('examples is required: a list of ["what to type", "what it does"] pairs, such as [["paris", "The weather in Paris"]]');
        return found;
    }
    if (examples.length > MAX_EXAMPLES)
        found.push(`examples can have at most ${MAX_EXAMPLES} entries`);
    examples.forEach((e, i) => {
        if (!isPair(e))
            found.push(`examples[${i}] must be a pair of texts: ["what to type after the prefix", "what it does"]`);
    });
    return found;
}

function isPair(e) {
    return Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' &&
        typeof e[1] === 'string' && e[1].trim() !== '';
}

export function normalizeExamples(examples) {
    return (Array.isArray(examples) ? examples : [])
        .filter(isPair)
        .slice(0, MAX_EXAMPLES)
        .map(([query, description]) => ({query: query.trim(), description: description.trim()}));
}

export function guideRows(keyword, examples, query) {
    const typed = query.trim().toLowerCase();
    return examples
        .map((e, index) => ({e, index, close: typed && e.query.toLowerCase().startsWith(typed) ? 0 : 1}))
        .sort((a, b) => a.close - b.close || a.index - b.index)
        .map(({e}) => ({title: exampleText(keyword, e.query), subtitle: e.description}));
}
