// SPDX-License-Identifier: GPL-3.0-or-later
// What a manifest must hold, for loading plugins and for installing them. Plain JavaScript, so node can test it.
// cli/qryg_search/manifest.py does the same for the command line: keep them in step.
import {guideProblems, isValidKeyword, normalizeExamples} from './guide.js';

export const API_VERSION = 1;
export const PLUGIN_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const POSITIONS = ['top', 'after-apps', 'bottom'];
export const CATEGORIES = ['general', 'apps', 'files', 'actions', 'clipboard'];
export const SETTING_TYPES = ['bool', 'int', 'string', 'strings', 'choice'];

export function providerId(id) {
    return `qryg-search-${id}`;
}

export function hasCommand(manifest) {
    return Array.isArray(manifest.command) && manifest.command.length > 0;
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

// Everything wrong with a manifest. `hasFile(path, executable)` says whether the plugin folder has that regular file.
export function manifestProblems(raw, hasFile, apiVersion = API_VERSION) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return ['manifest.json must be a JSON object'];
    const found = [];
    const {type, main} = raw;
    if (typeof raw.id !== 'string' || !PLUGIN_ID.test(raw.id))
        found.push('id must be lowercase letters, digits and dashes');
    if (typeof raw.name !== 'string' || !raw.name.trim())
        found.push('name is required');
    if (!['js', 'script'].includes(type))
        found.push('type must be "js" or "script"');
    else if (type === 'js' && !(typeof main === 'string' && main.endsWith('.js')))
        found.push('js plugins need "main": "plugin.js"');
    else if (type === 'js' && !hasFile(main, false))
        found.push(`${main} not found`);
    else if (type === 'script' && !hasCommand(raw)) {
        if (typeof main !== 'string')
            found.push('script plugins need "main" (an executable) or "command" (an argv array)');
        else if (!hasFile(main, true))
            found.push(`${main} is missing or not executable (chmod +x)`);
    }
    const api = raw.api ?? apiVersion;
    if (!Number.isInteger(api) || api < 1)
        found.push('api must be a whole number, such as 1');
    else if (api > apiVersion)
        found.push(`needs plugin API ${api}, this QryG supports ${apiVersion}; update QryG first`);
    found.push(...guideProblems(raw));
    try {
        manifestFiles(raw);
    } catch (e) {
        found.push(e.message);
    }
    return found;
}

// Fills in defaults for a manifest without problems. Only bundled plugins may use QryG's own settings, through
// `toggle` and a setting's `gsetting`.
export function normalizeManifest(raw, bundled = false) {
    const m = {...raw};
    m.examples = normalizeExamples(m.examples);
    m.position = POSITIONS.includes(m.position) ? m.position : 'bottom';
    m.priority = Number.isInteger(m.priority) ? m.priority : 50;
    m.category = CATEGORIES.includes(m.category) ? m.category : 'general';
    m.global = m.global !== false;
    m.completion = m.completion !== false;
    m.persistent = m.type === 'script' && m.persistent === true;
    m.api = Number.isInteger(m.api) ? m.api : API_VERSION;
    m.minQueryLength = Number.isInteger(m.minQueryLength) ? Math.max(0, m.minQueryLength) : 1;
    m.timeout = Number.isInteger(m.timeout) ? Math.min(10000, Math.max(100, m.timeout)) : 1500;
    m.startupTimeout = Number.isInteger(m.startupTimeout) ? Math.min(30000, Math.max(0, m.startupTimeout)) : 5000;
    m.icon = typeof m.icon === 'string' ? m.icon : 'application-x-addon-symbolic';
    m.description = typeof m.description === 'string' ? m.description : '';
    m.version = typeof m.version === 'string' ? m.version : '0.0.0';
    m.settings = (Array.isArray(m.settings) ? m.settings : [])
        .filter(s => s && typeof s.key === 'string' && SETTING_TYPES.includes(s.type))
        .map(s => bundled || !s.gsetting ? s : {...s, gsetting: undefined});
    if (!bundled)
        delete m.toggle;
    m.bundled = bundled;
    return m;
}

// The prefix in use: the stored one if it is valid, '' for none, otherwise the manifest's.
export function resolveKeyword(custom, manifest) {
    if (custom === '')
        return null;
    return isValidKeyword(custom) ? custom : manifest.keyword ?? null;
}

// `disabled` is the disabled-providers list; `readToggle(key)` reads a boolean QryG setting and may throw.
export function isPluginEnabled(manifest, disabled, readToggle) {
    if (disabled.includes(providerId(manifest.id)))
        return false;
    if (!manifest.toggle)
        return true;
    try {
        return readToggle(manifest.toggle);
    } catch {
        return true;
    }
}
