// SPDX-License-Identifier: GPL-3.0-or-later
// Every plugin needs a prefix and a usage guide. Plain JavaScript, so node can test it.
// cli/qryg_search/manifest.py does the same for the command line: keep them in step.

export const MAX_EXAMPLES = 10;

export function isValidKeyword(keyword) {
    return typeof keyword === 'string' && /^\S{1,12}$/.test(keyword);
}

export function isWordKeyword(keyword) {
    return /^[\p{L}\p{N}]/u.test(keyword);
}

// What to type for an example, with the prefix the user has now.
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
        found.push('examples is required: a list of {"query", "description"} entries that show how to use the plugin');
        return found;
    }
    if (examples.length > MAX_EXAMPLES)
        found.push(`examples can have at most ${MAX_EXAMPLES} entries`);
    examples.forEach((e, i) => {
        if (!e || typeof e !== 'object' || Array.isArray(e))
            found.push(`examples[${i}] must be an object with "query" and "description"`);
        else if (typeof e.query !== 'string')
            found.push(`examples[${i}].query must be a string: what to type after the prefix`);
        else if (typeof e.description !== 'string' || !e.description.trim())
            found.push(`examples[${i}].description is required`);
    });
    return found;
}

export function normalizeExamples(examples) {
    return (Array.isArray(examples) ? examples : [])
        .filter(e => e && typeof e.query === 'string' && typeof e.description === 'string' && e.description.trim())
        .slice(0, MAX_EXAMPLES)
        .map(e => ({query: e.query.trim(), description: e.description.trim()}));
}

// Example rows for the launcher, closest to what was typed first.
export function guideRows(keyword, examples, query) {
    const typed = query.trim().toLowerCase();
    return examples
        .map((e, index) => ({e, index, close: typed && e.query.toLowerCase().startsWith(typed) ? 0 : 1}))
        .sort((a, b) => a.close - b.close || a.index - b.index)
        .map(({e}) => ({title: exampleText(keyword, e.query), subtitle: e.description}));
}
