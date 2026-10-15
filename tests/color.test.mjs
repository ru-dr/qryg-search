// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as Color from '../plugins/colors/color.js';

test('parses hex, rgb and hsl', () => {
    assert.deepEqual(Color.parseColor('#ff375f'), {r: 255, g: 55, b: 95, a: 1});
    assert.deepEqual(Color.parseColor('#abc'), {r: 170, g: 187, b: 204, a: 1});
    assert.equal(Color.parseColor('rgba(0, 0, 0, 0.5)').a, 0.5);
    assert.deepEqual(Color.parseColor('hsl(0, 100%, 50%)'), {r: 255, g: 0, b: 0, a: 1});
    assert.equal(Color.parseColor('tomato'), null);
    assert.equal(Color.parseColor('#abcde'), null);
    assert.ok(Color.HEX_DIGITS.test('ff375f'));
    assert.ok(!Color.HEX_DIGITS.test('ff37'.repeat(3)));
});

test('converts between formats', () => {
    const red = {r: 255, g: 0, b: 0, a: 1};
    assert.equal(Color.toHex(red), '#FF0000');
    assert.deepEqual(Color.toHsl(red), [0, 100, 50]);
    assert.deepEqual(Color.toHsv(red), [0, 100, 100]);
    assert.deepEqual(Color.toCmyk(red), [0, 100, 100, 0]);
});

test('contrast and spectrum', () => {
    const white = {r: 255, g: 255, b: 255, a: 1};
    const black = {r: 0, g: 0, b: 0, a: 1};
    assert.equal(Math.round(Color.contrast(white, black)), 21);
    const spectrum = Color.spectrum({r: 255, g: 55, b: 95, a: 1});
    assert.equal(spectrum.length, 5);
    assert.equal(Color.toHex(spectrum[2]), '#FF375F');
});
