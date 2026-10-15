// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as R from '../lib/plugins/remote.js';

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
        assert.equal(R.problems(manifest, hasFile, 1).length === 0, ok, JSON.stringify(manifest));
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
    assert.deepEqual(R.tarEntries('x\n', bsd), [{name: 'x', type: 'file', size: 12}]);
    assert.throws(() => R.tarEntries('x\ny\n', bsd), /listing/);
    assert.throws(() => R.checkEntries([{name: '../evil', type: 'file', size: 1}]), /relative path/);
    assert.throws(() => R.checkEntries([{name: '/etc/passwd', type: 'file', size: 1}]), /relative path/);
    assert.throws(() => R.checkEntries([{name: 'dev', type: 'other', size: 0}]), /not a file/);
    R.checkEntries([{name: './', type: 'dir', size: 0}]);
    assert.equal(R.zipSize('3 files, 10 bytes uncompressed, 10 bytes compressed:  0.0%'), 10);
    assert.throws(() => R.checkEntries(R.zipEntries('a\n'), 5, 6), /more than/);
});

test('the confirmation card names the risk', () => {
    const rows = Object.fromEntries(R.card({id: 'w', name: 'W', type: 'js'}, 'https://x', '/p/w', null));
    assert.match(rows.Type, /inside GNOME Shell/);
    assert.equal(rows.Replaces, 'nothing, it is new');
    assert.equal(Object.fromEntries(R.card({id: 'w', name: 'W', type: 'script'}, 'x', '/p/w', {id: 'w', version: '1'})).Replaces,
        'the installed w 1');
});
