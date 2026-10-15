// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import {Feature} from '../core/config.js';
import {Patcher} from '../core/patcher.js';
import {appInfoId} from './scope.js';
import {ResultSection} from './section.js';

export class ResultsLayout {
    constructor({config, scope, isPluginEnabled, onProviderRegistered, beforeSelection, onResultsChanged, noResultsText}) {
        this._config = config;
        this._scope = scope;
        this._isPluginEnabled = isPluginEnabled;
        this._onProviderRegistered = onProviderRegistered;
        this._beforeSelection = beforeSelection;
        this._onResultsChanged = onResultsChanged;
        this._noResultsText = noResultsText;
        this._patcher = new Patcher();
        this._view = null;
    }

    enable(view) {
        this._view = view;
        this._patchView(view);
        this.rebuild();
    }

    disable() {
        this._patcher.restoreAll();
        this.rebuild();
        this._view = null;
    }

    research() {
        if (this._view?.mapped && this._view._terms.length > 0)
            this._view._doSearch();
    }

    rebuild() {
        const view = this._view;
        if (!view)
            return;
        view._cancellable.cancel();
        view._cancellable = new Gio.Cancellable();
        for (const provider of view._providers) {
            provider.display?.destroy();
            provider.display = null;
        }
        for (const provider of view._providers)
            view._ensureProviderDisplay(provider);
        view._defaultResult = null;
        this.research();
    }

    isProviderEnabled(provider) {
        if (provider.isQrygSearchPlugin)
            return this._isPluginEnabled(provider);
        const disabled = this._config.disabledProviders;
        return !disabled.includes(provider.id) && !disabled.includes(appInfoId(provider));
    }

    _patchView(view) {
        const layout = this;
        const context = {config: this._config, scope: this._scope};
        this._patcher.replace(view, '_registerProvider', original => provider => {
            original.call(view, provider);
            this._onProviderRegistered();
        });
        this._patcher.replace(view, '_ensureProviderDisplay', () => provider => {
            if (provider.display)
                return;
            const section = new ResultSection(provider, view, context);
            section.connect('notify::focus-child', view._focusChildChanged.bind(view));
            section.hide();
            view._content.add_child(section);
            provider.display = section;
        });
        this._patcher.replace(view, '_maybeSetInitialSelection', original => () => {
            this._beforeSelection();
            original.call(view);
            this._syncTopHit();
            this._onResultsChanged();
        });
        this._patcher.replace(view, '_updateSearchProgress', original => () => {
            original.call(view);
            const text = view._statusContainer?.visible && !view.searchInProgress ? this._noResultsText() : null;
            if (text)
                view._statusText?.set_text(text);
        });
        this._patcher.replace(view, '_doProviderSearch', original => async function (provider, previousResults) {
            if (layout.isProviderEnabled(provider) && layout._scope.queries(provider))
                return original.call(this, provider, previousResults);
            this._results[provider.id] = [];
            return this._updateResults(provider, this._terms, []);
        });
    }

    _syncTopHit() {
        const top = this._config.feature(Feature.TOP_HIT) ? this._view._defaultResult : null;
        for (const provider of this._view._providers) {
            const section = provider.display;
            if (section instanceof ResultSection)
                section.setTopHit(section.hasRow(top) ? top : null);
        }
    }
}
