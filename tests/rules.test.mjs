// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accessSync, constants, readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isValidKeyword, isWordKeyword} from '../lib/plugins/guide.js';
import {isPluginEnabled, manifestProblems, normalizeManifest, resolveKeyword} from '../lib/plugins/rules.js';

const PLUGINS = fileURLToPath(import.meta.resolve('../plugins'));
const BASE = {id: 'x', name: 'X', type: 'js', main: 'plugin.js', keyword: 'x', examples: [['a', 'Does a']]};
const always = () => true;

function hasFileIn(dir) {
    return (path, executable) => {
        try {
            accessSync(join(dir, path), executable ? constants.X_OK : constants.R_OK);
            return statSync(join(dir, path)).isFile();
        } catch {
            return false;
        }
    };
}

test('every bundled plugin passes the manifest rules', () => {
    for (const id of readdirSync(PLUGINS)) {
        const raw = JSON.parse(readFileSync(join(PLUGINS, id, 'manifest.json'), 'utf8'));
        assert.deepEqual(manifestProblems(raw, hasFileIn(join(PLUGINS, id))), [], id);
    }
});

test('all problems are reported at once', () => {
    const problems = manifestProblems({id: 'Bad Id', type: 'js', main: 'x.py', api: 'one', files: ['../x']}, always);
    assert.equal(problems.length, 7, problems.join('\n'));
    assert.deepEqual(manifestProblems([], always), ['manifest.json must be a JSON object']);
    assert.match(manifestProblems({...BASE, api: 2}, always).join(), /update QryG first/);
    assert.deepEqual(manifestProblems({...BASE, api: null}, always), []);
    assert.deepEqual(manifestProblems(BASE, () => false), ['plugin.js not found']);
});

test('only bundled plugins can use QryG settings', () => {
    const raw = {...BASE, toggle: 'feature-x', settings: [{key: 'k', type: 'string', gsetting: 'terminal'}, {key: 1}]};
    const installed = normalizeManifest(raw, false);
    assert.equal(installed.toggle, undefined);
    assert.equal(installed.settings.length, 1);
    assert.equal(installed.settings[0].gsetting, undefined);
    const bundled = normalizeManifest(raw, true);
    assert.equal(bundled.toggle, 'feature-x');
    assert.equal(bundled.settings[0].gsetting, 'terminal');
    assert.equal(normalizeManifest({...BASE, api: null}).api, 1);
    assert.deepEqual(normalizeManifest(BASE).examples, [{query: 'a', description: 'Does a'}]);
});

test('a stored prefix falls back to the default when it is not valid', () => {
    const manifest = {keyword: 'wx'};
    assert.equal(resolveKeyword(undefined, manifest), 'wx');
    assert.equal(resolveKeyword('', manifest), null);
    assert.equal(resolveKeyword('w', manifest), 'w');
    assert.equal(resolveKeyword('two words', manifest), 'wx');
    assert.equal(resolveKeyword(5, manifest), 'wx');
    assert.equal(resolveKeyword(undefined, {}), null);
});

test('a plugin is on unless disabled or its toggle is off', () => {
    const manifest = {id: 'files', toggle: 'feature-file-search'};
    assert.equal(isPluginEnabled(manifest, [], () => false), false);
    assert.equal(isPluginEnabled(manifest, [], () => true), true);
    assert.equal(isPluginEnabled(manifest, ['qryg-search-files'], () => true), false);
    assert.equal(isPluginEnabled(manifest, [], () => {
        throw new Error('no such key');
    }), true);
    assert.equal(isPluginEnabled({id: 'x'}, [], () => false), true);
});

test('prefixes count characters like the CLI does', () => {
    assert.ok(isValidKeyword('😀'.repeat(12)));
    assert.ok(!isValidKeyword('😀'.repeat(13)));
    assert.ok(isWordKeyword('wx'));
    assert.ok(!isWordKeyword('>'));
    assert.ok(!isWordKeyword(null));
    assert.ok(!isWordKeyword(undefined));
});
