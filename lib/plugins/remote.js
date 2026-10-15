// SPDX-License-Identifier: GPL-3.0-or-later
// Where a plugin install comes from, without touching the disk or the network, so node can test it.
// cli/qryg_search/remote.py does the same for the command line: keep them in step.

import {safeRelative} from './rules.js';

export {manifestFiles, safeRelative} from './rules.js';

export const SOURCE_FILE = '.qryg-search-source.json';
export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 1024 * 1024;
export const IGNORED = ['.git', '__MACOSX'];
export function installWarning(source) {
    return 'Warning: plugins run code on your computer. A JavaScript plugin runs inside GNOME Shell with full access to ' +
        'your session; a script plugin runs as your user. Only install plugins from sources you trust, and read the ' +
        `code first: ${source}`;
}

export const RISKS = {
    js: 'JavaScript: runs inside GNOME Shell with full access to your session',
    script: 'Script: runs as your user, with your permissions',
};

const ARCHIVE_SUFFIXES = ['.zip', '.tar.gz', '.tgz', '.tar.xz'];
const URL_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;
const SCP = /^[\w.-]+@[\w.-]+:/;
const GIT_SCHEMES = ['http', 'https', 'ssh', 'git', 'file'];
const SUBDIR = new RegExp('^(?<repo>(?:https?|file)://[^/?#]*/[^/?#]+/[^?#]+?)(?:/-)?' +
    '/(?<mode>tree|blob|src/(?:branch|tag|commit))/(?<ref>[^/?#]+)(?<path>/[^?#]*)?(?:[?#].*)?$');
const TREE_STYLES = {'gitlab.com': '/-/tree/', 'codeberg.org': '/src/branch/'};

export function isUrl(source) {
    return URL_SCHEME.test(source) || SCP.test(source);
}

function urlPath(source) {
    return source.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*([^?#]*)/)?.[1] ?? '';
}

function isArchive(name) {
    const lower = name.toLowerCase();
    return ARCHIVE_SUFFIXES.some(suffix => lower.endsWith(suffix));
}

export function classify(source) {
    const spec = {kind: null, source, repo: null, ref: null, subdir: ''};
    if (!source)
        throw new Error('give a folder, git URL, archive URL or manifest URL');
    if (!isUrl(source)) {
        spec.kind = isArchive(source) ? 'archive' : 'folder';
        return spec;
    }
    const scheme = source.match(URL_SCHEME)?.[1].toLowerCase() ?? 'ssh';
    const path = urlPath(source);
    const web = ['http', 'https', 'file'].includes(scheme);
    const match = source.match(SUBDIR);
    if (match) {
        const parts = (match.groups.path ?? '').split('/').filter(part => part !== '' && part !== '.');
        if (parts.length > 0 && (match.groups.mode === 'blob' || parts.at(-1) === 'manifest.json'))
            parts.pop();
        Object.assign(spec, {
            kind: 'subdir', repo: match.groups.repo, ref: match.groups.ref,
            subdir: parts.length > 0 ? safeRelative(parts.join('/'), 'folder') : '',
        });
    } else if (web && isArchive(path)) {
        spec.kind = 'archive';
    } else if (web && path.split('/').at(-1) === 'manifest.json') {
        spec.kind = 'manifest';
    } else if (GIT_SCHEMES.includes(scheme)) {
        Object.assign(spec, {kind: 'git', repo: source});
    } else {
        throw new Error(`unsupported URL ${source}; use https://, ssh://, git@ or a local folder`);
    }
    return spec;
}

export function subfolderUrl(repo, path, ref = 'HEAD') {
    if (!/^(https?|file):\/\//.test(repo))
        return null;
    const base = repo.replace(/\/+$/, '').replace(/\.git\/?$/, '');
    const host = (base.match(/^[a-z]+:\/\/(?:[^@/]*@)?([^/:?#]*)/i)?.[1] ?? '').toLowerCase();
    return `${base}${TREE_STYLES[host] ?? '/tree/'}${ref}/${path}`;
}

function quote(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function fileUrl(base, path) {
    return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + path.split('/').map(quote).join('/');
}

export function card(manifest, source, target, existing) {
    const replaces = existing
        ? `the installed ${existing.name ?? existing.id} ${existing.version ?? ''}`.trimEnd() : 'nothing, it is new';
    return [
        ['Name', manifest.name],
        ['ID', manifest.id],
        ['Version', manifest.version || 'unknown'],
        ['Author', manifest.author || 'unknown'],
        ['Type', RISKS[manifest.type]],
        ['Source', source],
        ['Folder', target],
        ['Replaces', replaces],
    ];
}

// Reads `tar -tf` and `tar -tvf` output (GNU tar or bsdtar) into entries for checkEntries.
export function tarEntries(names, verbose) {
    const nameLines = names.split('\n').filter(Boolean);
    const verboseLines = verbose.split('\n').filter(Boolean);
    if (nameLines.length !== verboseLines.length)
        throw new Error('could not read the archive listing');
    return nameLines.map((name, i) => {
        const line = verboseLines[i];
        const match = line.match(/^(\S)\S*\s+\S+\/\S+\s+(\d+)\s/) ?? line.match(/^(\S)\S*\s+\d+\s+\S+\s+\S+\s+(\d+)\s/);
        const type = {'-': 'file', 'd': 'dir', 'l': 'link'}[match?.[1]] ?? 'other';
        const arrow = `${name} -> `;
        const at = type === 'link' ? line.indexOf(arrow) : -1;
        return {name, type, size: match ? Number(match[2]) : 0, target: at >= 0 ? line.slice(at + arrow.length) : null};
    });
}

// Reads `unzip -Z1` and `unzip -Z` output into entries for checkEntries. A zip listing has no link targets.
export function zipEntries(names, listing) {
    const nameLines = names.split('\n').filter(Boolean);
    const types = listing.split('\n')
        .map(line => line.match(/^([-dl])\S*\s+\d+\.\d+\s+\S+\s+\d+\s/)?.[1])
        .filter(Boolean);
    if (nameLines.length !== types.length)
        throw new Error('could not read the archive listing');
    return nameLines.map((name, i) => ({name, type: {'-': 'file', 'd': 'dir', 'l': 'link'}[types[i]], size: 0, target: null}));
}

export function zipSize(totals) {
    const total = totals.match(/(\d+) bytes uncompressed/);
    if (!total)
        throw new Error('could not read the archive listing');
    return Number(total[1]);
}

// Whether a link at `name` pointing to `target` leads above the archive root.
function linkEscapes(name, target) {
    if (target.startsWith('/'))
        return true;
    const parts = name.split('/').slice(0, -1);
    for (const part of target.split('/')) {
        if (part === '..' && parts.length === 0)
            return true;
        if (part === '..')
            parts.pop();
        else if (part !== '' && part !== '.')
            parts.push(part);
    }
    return false;
}

export function checkEntries(entries, limit = MAX_BYTES, declared = 0) {
    let total = declared;
    const tooBig = () => new Error(`the archive unpacks to more than ${Math.floor(limit / 1024 / 1024)} MB`);
    if (total > limit)
        throw tooBig();
    const clean = entries.filter(({name}) => !name.split('/').every(part => part === '' || part === '.'))
        .map(entry => ({...entry, path: safeRelative(entry.name, 'archive entry')}));
    const links = new Set(clean.filter(e => e.type === 'link').map(e => e.path));
    for (const {name, type, size, target, path} of clean) {
        if (type === 'other')
            throw new Error(`archive entry ${name} is not a file, folder or link`);
        if (type === 'link' && target !== null && target !== undefined && linkEscapes(path, target))
            throw new Error(`archive link ${name} points outside the plugin`);
        const parts = path.split('/');
        for (let i = 1; i < parts.length; i++) {
            if (links.has(parts.slice(0, i).join('/')))
                throw new Error(`archive entry ${name} is inside the link ${parts.slice(0, i).join('/')}`);
        }
        total += size;
        if (total > limit)
            throw tooBig();
    }
}

// `found` holds the plugin folders under the fetched folder, relative to it.
export function pluginChoice(found, spec) {
    if (found.length === 1)
        return found[0];
    if (found.length === 0)
        throw new Error(`no manifest.json found in ${spec.source}`);
    const names = found.join(', ');
    if (spec.kind === 'archive')
        throw new Error(`this archive holds several plugins (${names}); unpack it and install one folder`);
    const example = subfolderUrl(spec.repo, `${spec.subdir ? `${spec.subdir}/` : ''}${found[0]}`, spec.ref ?? 'HEAD');
    const hint = example ? `, for example:\n  qryg plugin install ${example}` : '';
    throw new Error(`this repository holds several plugins (${names}); pass the URL of one folder${hint}`);
}
