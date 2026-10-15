// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import * as Emoji from '../plugins/emoji/search.js';
import * as Session from '../plugins/session/actions.js';
import * as Proc from '../plugins/processes/proc.js';
import * as Currency from '../plugins/currency/parse.js';
import * as Text from '../lib/plugins/text.js';
import {copyRow, warningRow} from '../lib/plugins/rows.js';
import {toUrl} from '../lib/plugins/url.js';

const data = JSON.parse(readFileSync(new URL('../plugins/emoji/emoji.json', import.meta.url), 'utf8'));
const entries = Emoji.index(data);
const top = query => Emoji.search(entries, query, 5).map(({entry}) => entry.char);

test('emoji data is complete and compact', () => {
    assert.ok(data.length > 1500);
    assert.ok(readFileSync(new URL('../plugins/emoji/emoji.json', import.meta.url)).length < 300 * 1024);
    assert.ok(entries.some(e => e.char === '❤️' && e.name === 'red heart'));
    assert.ok(entries.some(e => e.char === '🏳️‍🌈'));
    assert.ok(!entries.some(e => /[\u{1F3FB}-\u{1F3FF}]/u.test(e.char)), 'skin tone variants are generated, not stored');
});

test('emoji search by name, keyword and character', () => {
    assert.equal(top('fire')[0], '🔥');
    assert.equal(top('thumbs up')[0], '👍');
    assert.equal(top('cat')[0], '🐈');
    assert.equal(top('heart')[0], '❤️');
    assert.ok(top('tada').includes('🎉'));
    assert.equal(top('🔥')[0], '🔥');
    assert.deepEqual(top('zzzqqq'), []);
});

test('emoji skin tones and code points', () => {
    const thumbs = entries.find(e => e.name === 'thumbs up');
    assert.equal(Emoji.withTone(thumbs, 'dark'), '👍🏿');
    assert.equal(Emoji.withTone(thumbs, 'none'), '👍');
    const coder = entries.find(e => e.name === 'woman technologist');
    assert.equal(Emoji.withTone(coder, 'light'), '👩🏻‍💻');
    const fire = entries.find(e => e.name === 'fire');
    assert.equal(Emoji.withTone(fire, 'dark'), '🔥');
    assert.equal(Emoji.codepoints('❤️'), 'U+2764 U+FE0F');
});

test('session actions match whole words and prefixes only', () => {
    const ids = query => Session.matchActions(query).map(({action}) => action.id);
    assert.deepEqual(ids('lock'), ['lock']);
    assert.deepEqual(ids('sleep'), ['suspend']);
    assert.deepEqual(ids('reboot'), ['restart']);
    assert.deepEqual(ids('Sign out'), ['logout']);
    assert.deepEqual(ids('log out'), ['logout']);
    assert.deepEqual(ids('shutdown'), ['poweroff']);
    assert.deepEqual(ids('power off'), ['poweroff']);
    assert.deepEqual(ids('shut'), ['poweroff']);
    assert.deepEqual(ids('lo'), []);
    assert.deepEqual(ids('firefox'), []);
    assert.deepEqual(ids('clock'), []);
    assert.equal(Session.matchActions('lock')[0].score, 95);
    assert.ok(Session.matchActions('sus')[0].score < 80);
});

test('session actions match short words after the prefix', () => {
    const ids = query => Session.matchActions(query, {}, true).map(({action}) => action.id);
    assert.deepEqual(ids('lo').sort(), ['lock', 'logout']);
    assert.deepEqual(ids('re'), ['restart']);
    assert.deepEqual(ids(''), []);
});

test('session actions follow availability', () => {
    assert.deepEqual(Session.matchActions('suspend', {suspend: false}), []);
    assert.equal(Session.matchActions('hibernate').length, 0, 'hibernate needs a positive answer');
    assert.equal(Session.matchActions('hibernate', {hibernate: true}).length, 1);
    assert.equal(Session.matchActions('restart', {restart: true}).length, 1);
});

const STATUS = `Name:\tfirefox
Umask:\t0022
State:\tS (sleeping)
Pid:\t4242
PPid:\t2000
Uid:\t1000\t1000\t1000\t1000
VmRSS:\t  524288 kB
Threads:\t87
`;

test('parses /proc status, stat and cmdline', () => {
    const p = Proc.parseStatus(STATUS);
    assert.deepEqual(p, {name: 'firefox', pid: 4242, ppid: 2000, uid: 1000, state: 'S', rssKb: 524288, threads: 87});
    const stat = '4242 (Web Content (x) 1) S 2000 4242 4242 0 -1 4194560 1 0 0 0 5 3 0 0 20 0 87 0 123456 0 0';
    assert.equal(Proc.parseStartTime(stat), 123456);
    assert.deepEqual(Proc.parseCmdline('/usr/bin/sleep\u0000600\u0000'), ['/usr/bin/sleep', '600']);
    assert.equal(Proc.parseStatus('nothing'), null);
    assert.equal(Proc.formatMemory(524288), '512 MB');
    assert.equal(Proc.formatMemory(3 * 1024 * 1024), '3.0 GB');
    assert.equal(Proc.displayName({name: 'gnome-text-edit', argv: ['/usr/bin/gnome-text-editor']}), 'gnome-text-editor');
});

test('protects session processes', () => {
    for (const name of ['gnome-shell', 'gnome-session-b', 'systemd', 'dbus-broker-lau', 'dbus-daemon', 'Xwayland',
        'pipewire', 'pipewire-pulse', 'wireplumber'])
        assert.ok(Proc.isProtected(name), name);
    assert.ok(Proc.isProtected('python3', ['/usr/bin/gnome-shell']));
    assert.ok(Proc.isProtected('gjs', ['/usr/bin/gjs', '-m', '/usr/share/gnome-shell/org.gnome.Shell.Notifications']));
    assert.ok(!Proc.isProtected('firefox', ['/usr/lib64/firefox/firefox']));
});

test('ranks processes by match, then memory', () => {
    const procs = [
        {name: 'firefox', pid: 10, rssKb: 100, argv: ['/usr/lib64/firefox/firefox']},
        {name: 'Isolated Web Co', pid: 11, rssKb: 900, argv: ['/usr/lib64/firefox/firefox', '-contentproc']},
        {name: 'sleep', pid: 12, rssKb: 1, argv: ['sleep', '600']},
    ];
    const pids = query => Proc.rank(procs, query, 10).map(({proc}) => proc.pid);
    assert.deepEqual(pids('fire'), [10, 11]);
    assert.deepEqual(pids('sleep'), [12]);
    assert.deepEqual(pids('12'), [12]);
    assert.deepEqual(pids(''), [11, 10, 12]);
    assert.deepEqual(pids('chrome'), []);
});

test('currency queries', () => {
    const parse = Currency.parseQuery;
    assert.deepEqual(parse('50 usd to inr'), {amount: '50', from: 'USD', to: 'INR'});
    assert.deepEqual(parse('2*15 gbp in jpy'), {amount: '2*15', from: 'GBP', to: 'JPY'});
    assert.deepEqual(parse('100 eur'), {amount: '100', from: 'EUR', to: null});
    assert.deepEqual(parse('$50 to eur'), {amount: '50', from: 'USD', to: 'EUR'});
    assert.deepEqual(parse('€20'), {amount: '20', from: 'EUR', to: null});
    assert.deepEqual(parse('20€'), {amount: '20', from: 'EUR', to: null});
    for (const text of ['5 gal to cup', '10 min', '10 km to mi', '3 sec', 'firefox', '50 usd to xyz'])
        assert.equal(parse(text), null, text);
    assert.equal(Currency.currencyDigits('JPY'), 0);
    assert.equal(Currency.currencyDigits('EUR'), 2);
});

test('text helpers', () => {
    assert.equal(Text.capitalize('length'), 'Length');
    assert.equal(Text.capitalize(''), '');
    assert.equal(Text.truncate('abcdef', 3), 'abc…');
    assert.equal(Text.truncate('abc', 3), 'abc');
    assert.equal(Text.matchWords(['Report Q3.pdf'], ''), 0);
    assert.equal(Text.matchWords(['Report Q3.pdf'], 'pdf zip'), null);
    assert.equal(Text.matchWords(['Café menu', 'Firefox'], 'cafe firefox') > 0, true);
    assert.equal(Text.matchWords(['docs', '~/Documents'], 'docs'), 100);
    assert.ok(Text.matchWords('q3 report.pdf', 'report pdf') >= 60);
});

test('common rows and URLs', () => {
    assert.deepEqual(copyRow('42', 'Answer', 'icon'), {title: '42', subtitle: 'Answer', icon: 'icon', copy: '42', activate: {copy: '42'}});
    assert.deepEqual(copyRow('4 ft', 'x', 'icon', {copy: '4', id: 'a'}).activate, {copy: '4'});
    assert.equal(warningRow('Bad', 'why').icon, 'dialog-warning-symbolic');
    assert.equal(toUrl('example.com/x'), 'https://example.com/x');
    assert.equal(toUrl('localhost:8080'), 'http://localhost:8080');
    assert.equal(toUrl('localhost.example.com'), 'https://localhost.example.com');
    assert.equal(toUrl('HTTP://a.io'), 'HTTP://a.io');
});
