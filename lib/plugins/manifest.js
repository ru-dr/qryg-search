// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {guideProblems, normalizeExamples} from './guide.js';

export {isValidKeyword, isWordKeyword} from './guide.js';

export const API_VERSION = 1;
export const USER_PLUGIN_DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'qryg-search', 'plugins']);
export const POSITIONS = ['top', 'after-apps', 'bottom'];
export const CATEGORIES = ['general', 'apps', 'files', 'actions', 'clipboard'];
const SETTING_TYPES = ['bool', 'int', 'string', 'strings', 'choice'];
const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function providerId(id) {
    return `qryg-search-${id}`;
}

function readJson(path) {
    const [, bytes] = GLib.file_get_contents(path);
    return JSON.parse(new TextDecoder().decode(bytes));
}

export function hasCommand(manifest) {
    return Array.isArray(manifest.command) && manifest.command.length > 0;
}

function validate(raw, dir, bundled) {
    const problems = [];
    const m = {...raw};
    if (typeof m.id !== 'string' || !ID.test(m.id))
        problems.push('id must be lowercase letters, digits and dashes');
    if (typeof m.name !== 'string' || !m.name.trim())
        problems.push('name is required');
    if (!['js', 'script'].includes(m.type))
        problems.push('type must be "js" or "script"');
    if (m.type === 'js' && (typeof m.main !== 'string' || !m.main.endsWith('.js')))
        problems.push('js plugins need "main": "plugin.js"');
    if (m.type === 'script' && !hasCommand(m) && typeof m.main !== 'string')
        problems.push('script plugins need "main" (an executable) or "command" (an argv array)');
    if (m.api !== undefined && !(Number.isInteger(m.api) && m.api >= 1))
        problems.push('api must be a whole number, such as 1');
    else if (m.api > API_VERSION)
        problems.push(`needs plugin API ${m.api}, this QryG supports ${API_VERSION}; update QryG`);
    problems.push(...guideProblems(m));
    m.keyword = m.keyword || null;
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
    m.settings = Array.isArray(m.settings) ? m.settings.filter(s =>
        s && typeof s.key === 'string' && SETTING_TYPES.includes(s.type)) : [];
    m.dir = dir;
    m.bundled = bundled;
    if (m.type === 'js' && m.main && !GLib.file_test(GLib.build_filenamev([dir, m.main]), GLib.FileTest.EXISTS))
        problems.push(`${m.main} not found`);
    if (m.type === 'script' && !hasCommand(m) && m.main) {
        const exe = GLib.build_filenamev([dir, m.main]);
        if (!GLib.file_test(exe, GLib.FileTest.IS_EXECUTABLE))
            problems.push(`${m.main} is missing or not executable (chmod +x)`);
    }
    return {manifest: m, problems};
}

function listDir(dir) {
    const out = [];
    try {
        const it = Gio.File.new_for_path(dir).enumerate_children('standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = it.next_file(null)) !== null) {
            if (info.get_file_type() === Gio.FileType.DIRECTORY ||
                info.get_file_type() === Gio.FileType.SYMBOLIC_LINK)
                out.push(GLib.build_filenamev([dir, info.get_name()]));
        }
        it.close(null);
    } catch {}
    return out.sort();
}

export function scan(bundledDir) {
    const found = new Map();
    const broken = [];
    for (const [base, bundled] of [[bundledDir, true], [USER_PLUGIN_DIR, false]]) {
        if (!base)
            continue;
        for (const dir of listDir(base)) {
            const file = GLib.build_filenamev([dir, 'manifest.json']);
            if (!GLib.file_test(file, GLib.FileTest.EXISTS))
                continue;
            let raw;
            try {
                raw = readJson(file);
            } catch (e) {
                broken.push({dir, problems: [`manifest.json: ${e.message}`]});
                continue;
            }
            const {manifest, problems} = validate(raw, dir, bundled);
            if (problems.length > 0)
                broken.push({dir, id: manifest.id, problems});
            else
                found.set(manifest.id, manifest);
        }
    }
    return {plugins: [...found.values()], broken};
}
