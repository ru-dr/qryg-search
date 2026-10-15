// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {exampleText, guideProblems, guideRows, normalizeExamples} from '../lib/plugins/guide.js';

const PLUGINS = fileURLToPath(import.meta.resolve('../plugins'));
const bundled = readdirSync(PLUGINS).map(id => JSON.parse(readFileSync(join(PLUGINS, id, 'manifest.json'), 'utf8')));

test('examples are written with the prefix the user has now', () => {
    assert.equal(exampleText('tz', 'tokyo'), 'tz tokyo');
    assert.equal(exampleText('tz', ''), 'tz');
    assert.equal(exampleText(':', 'fire'), ':fire');
    assert.equal(exampleText('*', '+ ~/Projects'), '*+ ~/Projects');
    assert.equal(exampleText(null, 'tokyo'), 'tokyo');
});

test('a plugin needs a prefix and examples', () => {
    const examples = [{query: 'paris', description: 'Weather in Paris'}];
    assert.deepEqual(guideProblems({keyword: 'wx', examples}), []);
    assert.match(guideProblems({examples}).join(), /keyword is required/);
    assert.match(guideProblems({keyword: 'two words', examples}).join(), /without spaces/);
    assert.match(guideProblems({keyword: 'wx'}).join(), /examples is required/);
    assert.match(guideProblems({keyword: 'wx', examples: []}).join(), /examples is required/);
    assert.match(guideProblems({keyword: 'wx', examples: [{query: 'x'}]}).join(), /description is required/);
    assert.match(guideProblems({keyword: 'wx', examples: [{description: 'x'}]}).join(), /query must be a string/);
    assert.match(guideProblems({keyword: 'wx', examples: Array(11).fill(examples[0])}).join(), /at most 10/);
});

test('guide rows put examples that start with the typed text first', () => {
    const examples = normalizeExamples([
        {query: 'uuid', description: 'A UUID'},
        {query: ' password 32 ', description: 'A password'},
        {query: 'bad'},
    ]);
    assert.deepEqual(examples.map(e => e.query), ['uuid', 'password 32']);
    assert.deepEqual(guideRows('gen', examples, 'pa').map(r => r.title), ['gen password 32', 'gen uuid']);
    assert.deepEqual(guideRows('gen', examples, '').map(r => r.title), ['gen uuid', 'gen password 32']);
});

test('every bundled plugin has its own prefix and a guide', () => {
    for (const m of bundled)
        assert.deepEqual(guideProblems(m), [], m.id);
    const keywords = bundled.map(m => m.keyword);
    assert.equal(new Set(keywords).size, keywords.length, keywords.join(' '));
});
