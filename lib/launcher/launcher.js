// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as Bookmarks from '../core/bookmarks.js';
import {Feature} from '../core/config.js';
import {SourceTracker} from '../core/sources.js';
import {PluginManager} from '../plugins/manager.js';
import {ResultsLayout} from '../results/layout.js';
import {PreviewPane} from '../results/preview.js';
import {FilterMode, SearchScope} from '../results/scope.js';
import {ActionId, ActionRegistry} from './actions.js';
import {Completion} from './completion.js';
import {EscapeStep, FILTERS, activeFilterHint, cycleFilter, escapeStep, filterButtonHint, noResultsText} from './filters.js';
import {HotkeyMute} from './hotkeyMute.js';
import {KeyRouter, Keys} from './keyRouter.js';
import {ResultInfo} from './resultInfo.js';
import {RowActionsView} from './rowActions.js';
import {SearchBar} from './searchBar.js';

const BAR_ICON_SIZE = 24;

export class Launcher {
    constructor({config, takeover, close}) {
        this._config = config;
        this._takeover = takeover;
        this._close = close;
        this._sources = new SourceTracker();
        this._scope = new SearchScope();
        this._selected = null;
        this._lastQuery = '';
        this._hotkeys = new HotkeyMute();
        this._hoveredFilter = null;
        this._bar = new SearchBar({
            onFilterClicked: mode => this._toggleFilter(mode),
            onFilterHovered: mode => this._onFilterHovered(mode),
        });
        this._completion = new Completion(this._bar);
        this._preview = new PreviewPane({onCopied: () => close()});
        this._actions = new ActionRegistry({close, onBookmarksChanged: () => this._refreshResults()});
        this._rowActions = new RowActionsView();
        this._viewOrientation = null;
        this.plugins = new PluginManager(config, {
            keyword: () => this._scope.keyword,
            filter: () => this._scope.filter,
            refresh: () => this._layout.research(),
            setQuery: text => {
                this._entry.set_text(text);
                this._entry.clutter_text.set_selection(-1, -1);
            },
            beforeUnload: () => this._select(null),
            bookmarks: Bookmarks,
        });
        this._layout = new ResultsLayout({
            config,
            scope: this._scope,
            isPluginEnabled: provider => this.plugins.isEnabled(provider),
            onProviderRegistered: () => this.plugins.order(),
            beforeSelection: () => this.plugins.rank(),
            onResultsChanged: () => this._queueRefresh(),
            noResultsText: () => this._scope.keyword ? null : noResultsText(this._scope.filter),
        });
        this._keys = new KeyRouter(this._keyBindings());
    }

    get _entry() {
        return this._takeover.entry;
    }

    get _view() {
        return this._takeover.view;
    }

    get lastQuery() {
        return this._config.feature(Feature.REMEMBER_QUERY) ? this._lastQuery : '';
    }

    takeRecentSuperCombo() {
        return this._keys.takeRecentSuperCombo();
    }

    enable() {
        this._bar.takeIcon(this._entry);
        this._layout.enable(this._view);
        this._viewOrientation = this._view.orientation;
        this._view.orientation = Clutter.Orientation.HORIZONTAL;
        this._view.add_child(this._preview.actor);
        this._entry.clutter_text.connectObject('text-changed', () => this._onTextChanged(), this);
        this._config.onChanged(['plugins-reload'], () => this._reloadPlugins(), this);
        this.plugins.load(this._view).catch(e => console.warn('qryg-search: plugins failed to load:', e));
    }

    disable() {
        this._sources.clear();
        this._config.disconnect(this);
        this._entry.clutter_text.disconnectObject(this);
        this.plugins.unload();
        this._view.remove_child(this._preview.actor);
        this._view.orientation = this._viewOrientation;
        this._layout.disable();
        this._bar.returnIcon(this._entry);
        this._scope.reset();
    }

    destroy() {
        this._preview.destroy();
        this._bar.destroy();
    }

    mount(content) {
        const entry = this._entry;
        const controller = this._takeover.controller;
        entry.get_parent()?.remove_child(entry);
        entry.visible = true;
        entry.remove_transition('opacity');
        entry.opacity = 255;
        content.add_child(this._bar.actor);
        this._bar.attach(entry);
        controller.get_parent()?.remove_child(controller);
        content.add_child(controller);
        controller._text.set_text(this.lastQuery);
        controller.visible = this.lastQuery.length > 0;
    }

    unmount(content) {
        const entry = this._entry;
        const controller = this._takeover.controller;
        entry.visible = false;
        this._bar.detach(entry);
        if (this._bar.actor.get_parent() === content)
            content.remove_child(this._bar.actor);
        controller.hide();
        controller.get_parent()?.remove_child(controller);
    }

    onOpen() {
        this._syncKeyword();
        this._bar.configureFilters({
            visible: this._config.feature(Feature.FILTERS),
            available: mode => mode !== FilterMode.CLIPBOARD || this._clipboardAvailable(),
        });
        this._hoveredFilter = null;
        this._syncHint();
        if (this._config.feature(Feature.FILTERS))
            this._hotkeys.mute();
        this._keys.enable();
        global.stage.connectObject('notify::key-focus', () => this._queueRefresh(), this);
    }

    onShown() {
        this._entry.grab_key_focus();
        this._entry.clutter_text.set_selection(0, -1);
        this._queueRefresh();
    }

    onClose() {
        this._lastQuery = this._entry.get_text();
        global.stage.disconnectObject(this);
        this._keys.disable();
        this._hotkeys.unmute();
        this._setFilter(null, {research: false});
        this._select(null);
    }

    _clipboardAvailable() {
        const clipboard = this.plugins.provider('clipboard');
        return Boolean(clipboard && this.plugins.isEnabled(clipboard) && clipboard.available);
    }

    _reloadPlugins() {
        this.plugins.reload().catch(e => console.warn('qryg-search: plugin reload failed:', e));
    }

    _onTextChanged() {
        this._takeover.controller.visible = this._entry.get_text().length > 0;
        this._syncKeyword();
        this._queueRefresh();
    }

    _syncKeyword() {
        const before = this._scope.keyword;
        this._scope.keyword = this._config.feature(Feature.KEYWORDS)
            ? this.plugins.matchKeyword(this._entry.get_text().trimStart()) : null;
        // "gen" and "gen " are the same terms to GNOME, so it would not search again when only the prefix changes.
        if (this._scope.keyword !== before)
            this._sources.idle('keyword', () => this._layout.researchUnlessPending());
    }

    _toggleFilter(mode) {
        this._setFilter(this._scope.filter === mode ? null : mode);
        this._entry.grab_key_focus();
    }

    _setFilter(mode, {research = true} = {}) {
        this._scope.filter = mode;
        this._bar.markActiveFilter(mode);
        this._syncHint();
        if (research)
            this._layout.research();
    }

    _onFilterHovered(mode) {
        this._hoveredFilter = mode;
        this._syncHint();
    }

    _syncHint() {
        const hovered = this._hoveredFilter && this._hoveredFilter !== this._scope.filter
            ? filterButtonHint(this._hoveredFilter) : null;
        this._entry.hint_text = hovered ?? activeFilterHint(this._scope.filter) ?? this._config.placeholder;
    }

    _cycleFilter(step) {
        const next = cycleFilter(this._bar.availableFilters(), this._scope.filter, step);
        if (next !== this._scope.filter)
            this._setFilter(next);
        this._entry.grab_key_focus();
    }

    stepBack() {
        switch (escapeStep({filter: this._scope.filter, text: this._entry.get_text()})) {
        case EscapeStep.CLEAR_FILTER:
            this._setFilter(null);
            break;
        case EscapeStep.CLEAR_TEXT:
            this._entry.set_text('');
            break;
        default:
            return false;
        }
        this._entry.grab_key_focus();
        return true;
    }

    _refreshResults() {
        this._rowActions.invalidate();
        this._layout.research();
        this._queueRefresh();
    }

    _queueRefresh() {
        if (!this._sources.isPending('refresh'))
            this._sources.idle('refresh', () => this._select(this._currentRow()));
    }

    _currentRow() {
        const focus = global.stage.get_key_focus();
        let row = null;
        if (focus instanceof Search.SearchResult && this._view?.contains(focus))
            row = focus;
        else if (this._entry?.get_text().trim())
            row = this._view._defaultResult;
        return row?.mapped ? row : null;
    }

    _select(row) {
        this._selected = row ? new ResultInfo(row) : null;
        this._renderActions(row, this._selected);
        this._preview.show(this._config.feature(Feature.PREVIEW) ? row : null);
        this._bar.setResultIcon(this._config.feature(Feature.BAR_ICON) ? this._iconOf(row) : null);
        const typing = global.stage.get_key_focus() === this._entry?.clutter_text;
        this._completion.update(row, {
            entry: this._entry,
            enabled: this._config.feature(Feature.COMPLETION) && typing && !this._scope.keyword &&
                row === this._view?._defaultResult,
        });
    }

    _iconOf(row) {
        const icon = row?.metaInfo.createIcon?.(BAR_ICON_SIZE);
        const gicon = icon instanceof St.Icon ? icon.gicon : null;
        icon?.destroy();
        return gicon;
    }

    _renderActions(row, info) {
        if (this._rowActions.isShowing(row))
            return;
        const enabled = row && this._config.feature(Feature.ROW_ACTIONS);
        this._rowActions.show(row, enabled ? this._actions.forResult(info) : []);
    }

    _runAction(id) {
        return this._actions.run(this._selected, id);
    }

    _keyBindings() {
        const inEntry = () => global.stage.get_key_focus() === this._entry.clutter_text;
        const atEnd = () => {
            const text = this._entry.clutter_text;
            return text.cursor_position === -1 || text.cursor_position === text.text.length;
        };
        const fileActions = () => this._config.feature(Feature.FILE_ACTIONS);
        return [
            {
                matches: Keys.superDigit,
                run: key => {
                    const filter = FILTERS[Keys.digitIndex(key)];
                    if (this._bar.isFilterAvailable(filter.mode))
                        this._toggleFilter(filter.mode);
                    return this._config.feature(Feature.FILTERS);
                },
            },
            {
                matches: Keys.ctrlTab,
                run: key => {
                    if (!this._config.feature(Feature.FILTERS))
                        return false;
                    this._cycleFilter(key.shift ? -1 : 1);
                    return true;
                },
            },
            {matches: Keys.superEnter, run: () => fileActions() && this._runAction(ActionId.REVEAL)},
            {matches: Keys.superC, run: () => fileActions() && this._runAction(ActionId.COPY)},
            {matches: Keys.ctrlShiftE, run: () => this._runAction(ActionId.REVEAL)},
            {matches: Keys.ctrlShiftC, run: () => this._runAction(ActionId.COPY)},
            {matches: Keys.ctrlEnter, run: () => this._runAction(ActionId.NEW_WINDOW)},
            {matches: Keys.ctrlD, run: () => this._runAction(ActionId.BOOKMARK)},
            {
                matches: Keys.acceptCompletion,
                run: () => inEntry() && atEnd() && this._completion.accept(this._entry),
            },
            {
                matches: Keys.backspace,
                run: () => {
                    if (!inEntry() || this._entry.get_text() !== '' || this._scope.filter === null)
                        return false;
                    this._setFilter(null);
                    return true;
                },
            },
        ];
    }
}
