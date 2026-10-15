// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coerce} from '../lib/plugins/values.js';

const days = {key: 'days', type: 'int', min: 1, max: 7, default: 3};

test('int settings outside min and max fall back to the default', () => {
    assert.equal(coerce(days, 5), 5);
    assert.equal(coerce(days, 7), 7);
    assert.equal(coerce(days, 0), 3);
    assert.equal(coerce(days, 99), 3);
    assert.equal(coerce(days, 2.5), 3);
    assert.equal(coerce({key: 'n', type: 'int', min: 0}, -1), 0);
    assert.equal(coerce({key: 'n', type: 'int'}, -1000), -1000);
});

test('other types keep valid values and fall back otherwise', () => {
    assert.equal(coerce({type: 'bool', default: true}, 'yes'), true);
    assert.equal(coerce({type: 'bool'}, false), false);
    assert.deepEqual(coerce({type: 'strings', default: ['a']}, null), ['a']);
    assert.deepEqual(coerce({type: 'strings'}, [1, 'b']), ['1', 'b']);
    assert.equal(coerce({type: 'choice', choices: ['x', 'y']}, 'z'), 'x');
    assert.equal(coerce({type: 'choice', choices: ['x', 'y'], default: 'y'}, 'x'), 'x');
    assert.equal(coerce({type: 'string', default: 'Paris'}, 42), 'Paris');
});
