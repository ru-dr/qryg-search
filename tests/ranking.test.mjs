// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseScore, rankProviders, BaseScore} from '../lib/results/ranking.js';

const plugin = (id, position, priority = 50) => ({id, position, priority, isQrygSearchPlugin: true});
const native = id => ({id, isQrygSearchPlugin: false});
const ids = list => list.map(p => p.id);

test('base order keeps positions: top, apps, after-apps, native, bottom', () => {
    const providers = [plugin('web', 'bottom'), native('contacts'), plugin('calc', 'top', 10),
        plugin('windows', 'after-apps'), native('applications'), plugin('colors', 'top', 5)];
    assert.deepEqual(ids(rankProviders(providers, baseScore)),
        ['colors', 'calc', 'applications', 'windows', 'contacts', 'web']);
});

test('a scored result moves its section up', () => {
    const providers = [native('applications'), plugin('files', 'bottom')];
    const scores = {files: 95};
    assert.deepEqual(ids(rankProviders(providers, p => scores[p.id] ?? baseScore(p))), ['files', 'applications']);
});

test('a low score moves a top section down', () => {
    const providers = [plugin('calc', 'top'), native('applications')];
    const scores = {calc: 10};
    assert.deepEqual(ids(rankProviders(providers, p => scores[p.id] ?? baseScore(p))), ['applications', 'calc']);
    assert.equal(baseScore(native('applications')), BaseScore.APPS);
});
