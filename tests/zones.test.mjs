// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as Z from '../plugins/time/zones.js';

const ZONE_TAB = `# comment
JP\t+353916+1394441\tAsia/Tokyo
US\t+404251-0740023\tAmerica/New_York\tEastern (most areas)
US\t+340308-1181434\tAmerica/Los_Angeles\tPacific
IN\t+2232+08822\tAsia/Kolkata
UA\t+5026+03031\tEurope/Kyiv
`;
const COUNTRIES = 'JP\tJapan\nUS\tUnited States\nIN\tIndia\nUA\tUkraine\n';
const TZDATA = 'Z Asia/Tokyo 9:18:59 - LMT 1887\nL Asia/Kolkata Asia/Calcutta\nL Europe/Kyiv Europe/Kiev\nL America/Panama EST\n';
const index = Z.buildIndex({
    zones: Z.parseZoneTab(ZONE_TAB), countries: Z.parseCountries(COUNTRIES), links: Z.parseLinks(TZDATA),
});
const ids = place => Z.lookup(index, place).map(m => m.id);

test('finds the place in a world clock query', () => {
    assert.equal(Z.parsePlace('time tokyo'), 'tokyo');
    assert.equal(Z.parsePlace('time in new york'), 'new york');
    assert.equal(Z.parsePlace('now utc'), 'utc');
    assert.equal(Z.parsePlace('tokyo time'), 'tokyo');
    assert.equal(Z.parsePlace('time +5:30'), '+5:30');
    assert.equal(Z.parsePlace('utc+2'), 'utc+2');
    assert.equal(Z.parsePlace('time'), null);
    assert.equal(Z.parsePlace('tokyo'), null);
    assert.equal(Z.parsePlace('2+2'), null);
});

test('parses UTC offsets', () => {
    assert.equal(Z.parseOffset('+5:30'), 330);
    assert.equal(Z.parseOffset('utc+2'), 120);
    assert.equal(Z.parseOffset('GMT-0800'), -480);
    assert.equal(Z.parseOffset('utc'), 0);
    assert.equal(Z.parseOffset('+15'), null);
    assert.equal(Z.parseOffset('tokyo'), null);
});

test('looks up cities, countries, old names and abbreviations', () => {
    assert.deepEqual(ids('tokyo'), ['Asia/Tokyo']);
    assert.deepEqual(ids('New York'), ['America/New_York']);
    assert.deepEqual(ids('japan'), ['Asia/Tokyo']);
    assert.deepEqual(ids('calcutta'), ['Asia/Kolkata']);
    assert.deepEqual(ids('kiev'), ['Europe/Kyiv']);
    assert.deepEqual(ids('est'), ['America/New_York']);
    assert.deepEqual(ids('nyc'), ['America/New_York']);
    assert.deepEqual(ids('asia/tokyo'), ['Asia/Tokyo']);
    assert.deepEqual(ids('united states').sort(), ['America/Los_Angeles', 'America/New_York']);
    assert.ok(ids('los').includes('America/Los_Angeles'));
    assert.deepEqual(ids('atlantis'), []);
    assert.equal(Z.lookup(index, 'tokyo')[0].score, 90);
    assert.ok(Z.lookup(index, 'tok')[0].score < 90);
});

test('falls back to a built-in table without zone files', () => {
    const fallback = Z.buildIndex();
    assert.deepEqual(Z.lookup(fallback, 'tokyo').map(m => m.id), ['Asia/Tokyo']);
    assert.deepEqual(Z.lookup(fallback, 'mumbai').map(m => m.id), ['Asia/Kolkata']);
});

test('formats offsets, differences and relative times', () => {
    assert.equal(Z.formatOffset(330), 'UTC+05:30');
    assert.equal(Z.formatOffset(-210), 'UTC-03:30');
    assert.equal(Z.formatOffset(0), 'UTC+00:00');
    assert.equal(Z.difference(540, 120), '7 h ahead');
    assert.equal(Z.difference(-210, 0), '3 h 30 min behind');
    assert.equal(Z.difference(60, 60), 'Same time as here');
    assert.equal(Z.relative(-3 * 86400 - 5), '3 days ago');
    assert.equal(Z.relative(2 * 3600 + 30), 'in 2 hours');
    assert.equal(Z.relative(-60), '1 minute ago');
    assert.equal(Z.relative(4), 'Just now');
    assert.equal(Z.relative(-400 * 86400), '1 year ago');
});
