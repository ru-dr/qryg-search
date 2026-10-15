// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EscapeStep, activeFilterHint, cycleFilter, escapeStep, filterButtonHint, noResultsText} from '../lib/launcher/filters.js';
import {FilterMode} from '../lib/results/scope.js';

const ALL = [FilterMode.APPS, FilterMode.FILES, FilterMode.ACTIONS, FilterMode.CLIPBOARD];

test('Esc clears the filter, then the text, then closes', () => {
    assert.equal(escapeStep({filter: FilterMode.FILES, text: 'abc'}), EscapeStep.CLEAR_FILTER);
    assert.equal(escapeStep({filter: FilterMode.FILES, text: ''}), EscapeStep.CLEAR_FILTER);
    assert.equal(escapeStep({filter: null, text: 'abc'}), EscapeStep.CLEAR_TEXT);
    assert.equal(escapeStep({filter: null, text: ''}), EscapeStep.CLOSE);
});

test('Ctrl+Tab cycles through available filters and back to none', () => {
    assert.equal(cycleFilter(ALL, null, 1), FilterMode.APPS);
    assert.equal(cycleFilter(ALL, FilterMode.CLIPBOARD, 1), null);
    assert.equal(cycleFilter(ALL, null, -1), FilterMode.CLIPBOARD);
    assert.equal(cycleFilter(ALL, FilterMode.APPS, -1), null);
    const noClipboard = ALL.slice(0, 3);
    assert.equal(cycleFilter(noClipboard, FilterMode.ACTIONS, 1), null);
    assert.equal(cycleFilter(noClipboard, FilterMode.CLIPBOARD, 1), FilterMode.APPS);
    assert.equal(cycleFilter([], null, 1), null);
});

test('hints name the filter and its keys', () => {
    assert.equal(activeFilterHint(FilterMode.FILES), 'Search Files · Backspace to clear');
    assert.equal(filterButtonHint(FilterMode.ACTIONS), 'Search Actions · Super+3');
    assert.equal(noResultsText(FilterMode.CLIPBOARD), 'No results in Clipboard — press Esc to search everything');
    assert.equal(activeFilterHint(null), null);
    assert.equal(noResultsText(null), null);
});
