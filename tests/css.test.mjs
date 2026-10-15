// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCss, maxHeightStyle, scaledSize, scopeUserCss, textSizes, USER_ROOT} from '../lib/core/css.js';

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

test('default font size keeps the built-in text sizes', () => {
    const sizes = Object.fromEntries(textSizes(20).map(({selector, size}) => [selector.trim(), size]));
    assert.equal(sizes['.list-search-result'], 14);
    assert.equal(sizes['.qryg-search-section-header'], 12);
    assert.equal(sizes['.qryg-search-preview-value'], 11);
    assert.equal(sizes['.qryg-search-spectrum-hex'], 10);
});

test('text sizes follow the font size with minimums', () => {
    assert.equal(scaledSize(14, 28, 13), 20);
    assert.equal(scaledSize(14, 12, 13), 13);
    assert.equal(scaledSize(11, 12, 10), 10);
    assert.ok(textSizes(12).every(({size}) => size >= 10));
    assert.match(buildCss(config({fontSize: 30})), /\.list-search-result \{ font-size: 21px !important; \}/);
});

test('caps the window height on short monitors only', () => {
    assert.equal(maxHeightStyle({monitorHeight: 1080, topOffset: 22}), null);
    assert.equal(maxHeightStyle({monitorHeight: 768, topOffset: 22}), 'max-height: 551px;');
    assert.equal(maxHeightStyle({monitorHeight: 1200, topOffset: 22, scale: 2}), 'max-height: 420px;');
    assert.equal(maxHeightStyle({monitorHeight: 400, topOffset: 60}), 'max-height: 200px;');
});
