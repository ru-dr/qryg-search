// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../lib/plugins/math.js';
import * as E from '../plugins/calc/engine.js';
import * as U from '../plugins/units/units.js';

const value = expression => M.evaluate(expression).value;

test('arithmetic and precedence', () => {
    assert.equal(value('2+2*3'), 8);
    assert.equal(value('(1+2)*3'), 9);
    assert.equal(value('2^10'), 1024);
    assert.equal(value('2**0.5'), Math.SQRT2);
    assert.equal(value('17 // 5'), 3);
    assert.equal(value('-7 % 3'), 2);
    assert.equal(value('5!'), 120);
});

test('functions and constants', () => {
    assert.equal(value('sqrt(16)'), 4);
    assert.equal(value('sqrt 16'), 4);
    assert.equal(value('log(8, 2)'), 3);
    assert.ok(Math.abs(value('2pi') - 2 * Math.PI) < 1e-12);
    assert.equal(value('max(1, 9, 3)'), 9);
});

test('names from Object.prototype are not functions or constants', () => {
    for (const text of ['constructor(5)+1', '__proto__(1)', 'toString(1)', 'hasOwnProperty', 'valueOf 2'])
        assert.throws(() => value(text), /unknown/, text);
    assert.ok(!E.canCalculate('constructor(5)+1'));
});

test('bases and bitwise', () => {
    assert.equal(value('0xff | 0b1'), 255);
    assert.equal(value('7 xor 3'), 4);
    assert.equal(value('1 << 16'), 65536);
    assert.deepEqual(E.toBase(255, 16), {text: '0xFF', copy: '0xFF'});
    assert.deepEqual(E.toBase(10, 2), {text: '0b1010', copy: '0b1010'});
    assert.deepEqual(E.toBase(-300, 2), {text: '-0b0001 0010 1100', copy: '-0b000100101100'});
    assert.throws(() => value('1 << 100000'));
    assert.throws(() => value('3 & 1.5'));
});

test('only calculates things that look like math', () => {
    for (const text of ['2+2', '2pi', 'sqrt 2', '0x1f', '(1+2)*3', 'log 100', 'cosh pi', 'round e'])
        assert.ok(E.canCalculate(text), text);
    for (const text of ['2024', 'firefox', 'windows 11', '11 22', '10 km to mi', '2024-01-01', 'log out', 'e', 'pi'])
        assert.ok(!E.canCalculate(text), text);
});

test('unit conversion', () => {
    const km = U.convertUnits(10, 'km', 'mi');
    assert.ok(Math.abs(km.value - 6.213712) < 1e-6);
    assert.equal(km.category, 'length');
    assert.ok(Math.abs(U.convertUnits(100, 'f', 'c').value - 37.777778) < 1e-5);
    assert.equal(U.convertUnits(1, 'GiB', 'MiB').value, 1024);
    assert.equal(U.convertUnits(1, 'km', 'kg'), null);
    assert.ok(Math.abs(U.convertUnits(100, 'cal', 'J').value - 418.4) < 1e-9);
    assert.equal(U.convertUnits(1, 'kcal', 'cal').value, 1000);
});

test('no two unit names are the same when case is ignored', () => {
    const seen = new Map();
    for (const [category, def] of Object.entries(U.UNIT_DEFS)) {
        if (def.caseSensitive)
            continue;
        for (const [symbol, [, ...aliases]] of Object.entries(def.units)) {
            for (const name of [symbol, ...aliases]) {
                const key = name.toLowerCase();
                const owner = `${category} ${symbol}`;
                assert.ok(!seen.has(key) || seen.get(key) === owner, `"${name}" is both ${seen.get(key)} and ${owner}`);
                seen.set(key, owner);
            }
        }
    }
});

test('conversion queries name units, not currencies', () => {
    assert.deepEqual(U.CONVERSION.exec('5 l in cups').slice(1), ['5', 'l', 'cups']);
    assert.equal(U.CONVERSION.exec('50 $ to €'), null);
});

test('number formatting', () => {
    assert.equal(M.formatNumber(0.1 + 0.2), '0.3');
    assert.equal(M.formatNumber(1 / 0), '∞');
    assert.equal(M.formatGrouped(1234567.891, 2), '1,234,567.89');
});
