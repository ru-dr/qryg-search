// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {match} from '../lib/plugins/match.js';

test('an exact match scores 100', () => {
    assert.equal(match('Firefox', 'firefox'), 100);
});

test('prefix beats word start beats inside a word beats scattered letters', () => {
    const prefix = match('Files', 'fil');
    const word = match('GNOME Files', 'fil');
    const inside = match('Profiles', 'fil');
    const scattered = match('Find in folder', 'fif');
    assert.ok(prefix >= 80 && prefix < 100, `prefix ${prefix}`);
    assert.ok(word >= 60 && word < prefix, `word ${word}`);
    assert.ok(inside >= 40 && inside < word, `inside ${inside}`);
    assert.ok(scattered >= 10 && scattered < inside, `scattered ${scattered}`);
});

test('a longer share of the text scores higher', () => {
    assert.ok(match('Calc', 'cal') > match('Calculator', 'cal'));
});

test('no match is null, an empty query is 0', () => {
    assert.equal(match('Files', 'xyz'), null);
    assert.equal(match('Files', 'sf'), null);
    assert.equal(match('Files', '  '), 0);
});

test('ignores case and accents, and spaces for scattered letters', () => {
    assert.equal(match('Café', 'cafe'), 100);
    assert.ok(match('Visual Studio Code', 'vs code') !== null);
    assert.equal(match(null, 'a'), null);
});
