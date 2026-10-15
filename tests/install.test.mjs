// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as R from '../lib/plugins/remote.js';
import {manifestProblems} from '../lib/plugins/rules.js';

const CASES = JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('./fixtures/install/cases.json')), 'utf8'));
const pick = (spec, keys) => Object.fromEntries(keys.map(k => [k, spec[k]]));

test('sources are classified like the CLI does', () => {
    for (const {source, expect, error} of CASES.classify) {
        if (error)
            assert.throws(() => R.classify(source), Error, source);
        else
            assert.deepEqual(pick(R.classify(source), Object.keys(expect)), expect, source);
    }
});

test('a manifest URL fetches main and files', () => {
    for (const {manifest, expect, error} of CASES.files) {
        if (error)
            assert.throws(() => R.manifestFiles(manifest), Error);
        else
            assert.deepEqual(R.manifestFiles(manifest), expect);
    }
    for (const {base, path, expect} of CASES.urls)
        assert.equal(R.fileUrl(base, path), expect);
});

test('several plugins suggest a subfolder URL', () => {
    for (const {source, path, expect} of CASES.subfolders)
        assert.equal(R.subfolderUrl(source, path), expect);
    const spec = R.classify('https://github.com/you/repo');
    assert.equal(R.pluginChoice(['weather'], spec), 'weather');
    assert.throws(() => R.pluginChoice([], spec), /no manifest.json/);
    assert.throws(() => R.pluginChoice(['plugins/a', 'plugins/b'], spec),
        /plugins\/a, plugins\/b.*\n.*github\.com\/you\/repo\/tree\/HEAD\/plugins\/a/);
});

test('manifests are checked before installing', () => {
    for (const {manifest, files, ok} of CASES.manifests) {
        const hasFile = (path, executable) => path in files && (files[path] || !executable);
        assert.equal(manifestProblems(manifest, hasFile, 1).length === 0, ok, JSON.stringify(manifest));
    }
});

test('archive listings are checked for unsafe entries', () => {
    const names = 'p/\np/link\np/a b.txt\n';
    const gnu = 'drwxr-xr-x you/you 0 2026-10-14 20:25 p/\n' +
        'lrwxrwxrwx you/you 0 2026-10-14 20:25 p/link -> a b.txt\n' +
        '-rw-r--r-- you/you 2048 2026-10-14 20:25 p/a b.txt\n';
    const entries = R.tarEntries(names, gnu);
    assert.deepEqual(entries.map(e => [e.type, e.size]), [['dir', 0], ['link', 0], ['file', 2048]]);
    R.checkEntries(entries);
    assert.throws(() => R.checkEntries(entries, 1000), /more than/);
    const bsd = '-rw-r--r--  0 you  staff  12 Oct 14 20:25 x\n';
    assert.deepEqual(R.tarEntries('x\n', bsd), [{name: 'x', type: 'file', size: 12, target: null}]);
    assert.throws(() => R.tarEntries('x\ny\n', bsd), /listing/);
    assert.throws(() => R.checkEntries([{name: '../evil', type: 'file', size: 1}]), /relative path/);
    assert.throws(() => R.checkEntries([{name: '/etc/passwd', type: 'file', size: 1}]), /relative path/);
    assert.throws(() => R.checkEntries([{name: 'dev', type: 'other', size: 0}]), /not a file/);
    R.checkEntries([{name: './', type: 'dir', size: 0}]);
    assert.equal(R.zipSize('3 files, 10 bytes uncompressed, 10 bytes compressed:  0.0%'), 10);
    const zip = 'Archive:  t.zip\nZip file size: 739 bytes, number of entries: 2\n' +
        'drwxr-xr-x  3.0 unx        0 bx stor 26-Oct-15 14:18 p/\n' +
        'lrwxrwxrwx  3.0 unx        7 bx stor 26-Oct-15 14:18 p/link\n' +
        '2 files, 7 bytes uncompressed, 7 bytes compressed:  0.0%\n';
    assert.deepEqual(R.zipEntries('p/\np/link\n', zip).map(e => e.type), ['dir', 'link']);
    assert.throws(() => R.zipEntries('p/\n', zip), /listing/);
    assert.throws(() => R.checkEntries(R.zipEntries('p/\np/link\n', zip), 5, 6), /more than/);
});

test('archive links are checked before unpacking', () => {
    const link = (name, target) => ({name, type: 'link', size: 0, target});
    assert.equal(R.tarEntries('p/up\n', 'lrwxrwxrwx you/you 0 2026-10-14 20:25 p/up -> ../..\n')[0].target, '../..');
    R.checkEntries([link('p/link', 'a b.txt'), link('p/sub/up', '../..'), link('p/z', null)]);
    assert.throws(() => R.checkEntries([link('p/home', '/home/you')]), /points outside/);
    assert.throws(() => R.checkEntries([link('p/up', '../..')]), /points outside/);
    assert.throws(() => R.checkEntries([link('p/a', '..'), link('p/a/b', '..')]), /inside the link p\/a/);
    assert.throws(() => R.checkEntries([{name: 'p/l/x', type: 'file', size: 1}, link('p/l', 'q')]), /inside the link/);
});

test('the confirmation card names the risk', () => {
    assert.equal(R.installWarning(CASES.warning.source), CASES.warning.expect);
    const rows = Object.fromEntries(R.card({id: 'w', name: 'W', type: 'js'}, 'https://x', '/p/w', null));
    assert.match(rows.Type, /inside GNOME Shell/);
    assert.equal(rows.Replaces, 'nothing, it is new');
    assert.equal(Object.fromEntries(R.card({id: 'w', name: 'W', type: 'script'}, 'x', '/p/w', {id: 'w', version: '1'})).Replaces,
        'the installed w 1');
});
