// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCss, scopeUserCss, USER_ROOT} from '../lib/core/css.js';

const config = (overrides = {}) => ({
    accentColor: '#ff375f', opacity: 90, cornerRadius: 10, fontSize: 20, ...overrides,
});

test('every declaration is important so user settings win', () => {
    const css = buildCss(config());
    const declarations = css.match(/:\s*[^;{}]+;/g) ?? [];
    assert.ok(declarations.length > 10);
    assert.ok(declarations.every(d => d.includes('!important')));
});

test('applies accent, radius and opacity', () => {
    const css = buildCss(config());
    assert.match(css, /rgb\(255, 55, 95\)/);
    assert.match(css, /\.qryg-search-results \{ border-radius: 10px !important; \}/);
    assert.match(css, /rgba\(36, 36, 38, 0\.9\)/);
});

test('user styles are scoped above the built-in look', () => {
    const css = scopeUserCss('.qryg-search-bar, .theme-light .qryg-search-results { border-radius: 0 }');
    assert.equal(css, `${USER_ROOT} .qryg-search-bar, ${USER_ROOT}.theme-light .qryg-search-results { border-radius: 0 !important; }`);
});

test('user styles can target the container and drop comments', () => {
    const css = scopeUserCss('/* x */ .qryg-search-container { padding: 4px; color: red !important }');
    assert.equal(css, `${USER_ROOT} { padding: 4px !important; color: red !important; }`);
});

test('empty or broken user css produces nothing', () => {
    assert.equal(scopeUserCss(''), '');
    assert.equal(scopeUserCss('.a { }'), '');
});

test('falls back to the default accent for invalid colours', () => {
    assert.match(buildCss(config({accentColor: 'nope'})), /rgb\(10, 132, 255\)/);
});
