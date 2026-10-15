// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {URL} from 'node:url';
import * as Emoji from '../plugins/emoji/search.js';
import * as Session from '../plugins/session/actions.js';
import * as Proc from '../plugins/processes/proc.js';

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
    const ids = query => Session.match(query).map(({action}) => action.id);
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
    assert.equal(Session.match('lock')[0].score, 95);
    assert.ok(Session.match('sus')[0].score < 80);
});

test('session actions follow availability', () => {
    assert.deepEqual(Session.match('suspend', {suspend: false}), []);
    assert.equal(Session.match('hibernate').length, 0, 'hibernate needs a positive answer');
    assert.equal(Session.match('hibernate', {hibernate: true}).length, 1);
    assert.equal(Session.match('restart', {restart: true}).length, 1);
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
