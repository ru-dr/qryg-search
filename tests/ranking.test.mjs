// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {baseScore, rankProviders, BaseScore} from '../lib/results/ranking.js';
import {normalizeResultPriority, RESULT_KINDS} from '../lib/results/providers.js';

const plugin = (id, position, priority = 50) => ({id, position, priority, isQrygSearchPlugin: true});
const native = id => ({id, isQrygSearchPlugin: false});
const ids = list => list.map(p => p.id);

test('within one kind, base order keeps positions: top, after-apps, native, bottom', () => {
    const providers = [plugin('web', 'bottom'), native('contacts'), plugin('calc', 'top', 10),
        plugin('windows', 'after-apps'), plugin('colors', 'top', 5)];
    assert.deepEqual(ids(rankProviders(providers, baseScore)), ['colors', 'calc', 'windows', 'contacts', 'web']);
});

test('a scored result moves its section up within its kind', () => {
    const providers = [plugin('emoji', 'top'), plugin('bookmarks', 'bottom')];
    const scores = {bookmarks: 95};
    assert.deepEqual(ids(rankProviders(providers, p => scores[p.id] ?? baseScore(p))), ['bookmarks', 'emoji']);
});

test('a low score moves a top section down', () => {
    const providers = [plugin('calc', 'top'), native('applications')];
    const scores = {calc: 10};
    assert.deepEqual(ids(rankProviders(providers, p => scores[p.id] ?? baseScore(p))), ['applications', 'calc']);
    assert.equal(baseScore(native('applications')), BaseScore.APPS);
});

const app = () => ({id: 'applications', isQrygSearchPlugin: false});
const files = () => ({...plugin('files', 'bottom', 60), category: 'files'});
const calc = () => ({...plugin('calc', 'top', 10), category: 'actions'});

test('apps come first by default, even against an exact file match', () => {
    const scores = {files: 95};
    assert.deepEqual(ids(rankProviders([files(), calc(), app()], p => scores[p.id] ?? baseScore(p))),
        ['applications', 'calc', 'files']);
});

test('the result priority decides which kind gives the Top Hit', () => {
    const order = ['files', 'apps'];
    assert.deepEqual(ids(rankProviders([app(), calc(), files()], baseScore, order)), ['files', 'applications', 'calc']);
});

test('scores still order sections of the same kind', () => {
    const web = {...plugin('web', 'bottom', 100), category: 'general'};
    const bookmarks = {...plugin('bookmarks', 'after-apps', 10), category: 'general'};
    const scores = {web: 99};
    assert.deepEqual(ids(rankProviders([bookmarks, web], p => scores[p.id] ?? baseScore(p))), ['web', 'bookmarks']);
});

test('a stored priority list is cleaned up', () => {
    assert.deepEqual(normalizeResultPriority(['files', 'nonsense', 'files', 'apps']),
        ['files', 'apps', 'actions', 'general', 'clipboard']);
    assert.deepEqual(normalizeResultPriority(null), [...RESULT_KINDS]);
});
