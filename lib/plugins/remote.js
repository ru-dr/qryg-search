// SPDX-License-Identifier: GPL-3.0-or-later
// Where a plugin install comes from, without touching the disk or the network, so node can test it.
// cli/qryg_search/remote.py does the same for the command line: keep them in step.

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
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
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

export function safeRelative(path, what = 'path') {
    const problem = () => new Error(`${what} ${JSON.stringify(path)} must be a relative path inside the plugin`);
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\'))
        throw problem();
    const parts = path.split('/').filter(part => part !== '' && part !== '.');
    if (parts.length === 0 || parts.includes('..'))
        throw problem();
    return parts.join('/');
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

export function manifestFiles(manifest) {
    const files = manifest.files ?? [];
    if (!Array.isArray(files))
        throw new Error('"files" must be a list of relative paths');
    const result = [];
    for (const path of [...typeof manifest.main === 'string' ? [manifest.main] : [], ...files]) {
        const clean = safeRelative(path, 'file');
        if (clean !== 'manifest.json' && !result.includes(clean))
            result.push(clean);
    }
    return result;
}

function quote(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function fileUrl(base, path) {
    return base.replace(/[?#].*$/, '').replace(/[^/]*$/, '') + path.split('/').map(quote).join('/');
}

export function problems(manifest, hasFile, apiVersion) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
        return ['manifest.json must be a JSON object'];
    const found = [];
    const {type, main, command} = manifest;
    if (typeof manifest.id !== 'string' || !ID.test(manifest.id))
        found.push('id must be lowercase letters, digits and dashes');
    if (typeof manifest.name !== 'string' || !manifest.name.trim())
        found.push('name is required');
    if (!['js', 'script'].includes(type))
        found.push('type must be "js" or "script"');
    else if (type === 'js' && !(typeof main === 'string' && main.endsWith('.js')))
        found.push('js plugins need "main": "plugin.js"');
    else if (type === 'js' && !hasFile(main, false))
        found.push(`${main} not found`);
    else if (type === 'script' && !(Array.isArray(command) && command.length > 0)) {
        if (typeof main !== 'string')
            found.push('script plugins need "main" (an executable) or "command" (an argv array)');
        else if (!hasFile(main, true))
            found.push(`${main} is missing or not executable (chmod +x)`);
    }
    const api = manifest.api ?? apiVersion;
    if (!Number.isInteger(api) || api < 1)
        found.push('api must be a whole number, such as 1');
    else if (api > apiVersion)
        found.push(`needs plugin API ${api}, this QryG supports ${apiVersion}; update QryG first`);
    try {
        manifestFiles(manifest);
    } catch (e) {
        found.push(e.message);
    }
    return found;
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
        return {name, type, size: match ? Number(match[2]) : 0};
    });
}

// Reads `unzip -Z1` output into entries, and the size `unzip -Zt` reports, for checkEntries.
export function zipEntries(names) {
    return names.split('\n').filter(Boolean).map(name => ({name, type: name.endsWith('/') ? 'dir' : 'file', size: 0}));
}

export function zipSize(totals) {
    const total = totals.match(/(\d+) bytes uncompressed/);
    if (!total)
        throw new Error('could not read the archive listing');
    return Number(total[1]);
}

export function checkEntries(entries, limit = MAX_BYTES, declared = 0) {
    let total = declared;
    const tooBig = () => new Error(`the archive unpacks to more than ${Math.floor(limit / 1024 / 1024)} MB`);
    if (total > limit)
        throw tooBig();
    for (const {name, type, size} of entries) {
        if (name.split('/').every(part => part === '' || part === '.'))
            continue;
        safeRelative(name, 'archive entry');
        if (type === 'other')
            throw new Error(`archive entry ${name} is not a file, folder or link`);
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
