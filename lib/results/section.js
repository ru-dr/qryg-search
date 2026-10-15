// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {Feature} from '../core/config.js';
import {leaveOverview} from '../core/overview.js';
import {appInfoId} from './scope.js';
import {RowIconSize, rowIcon, answerFirstCalculatorMeta} from './rowStyles.js';

const SearchResultsBase = Object.getPrototypeOf(Search.ListSearchResults);
const CALCULATOR_ID = 'org.gnome.Calculator.desktop';

function activateAppResult(id) {
    const app = Shell.AppSystem.get_default().lookup_app(id);
    if (app)
        app.activate();
    else
        SystemActions.getDefault().activateAction(id);
}

export const ResultSection = GObject.registerClass(
class ResultSection extends SearchResultsBase {
    _init(provider, view, context) {
        super._init(provider, view);
        this._context = context;
        this._topRow = null;
        this._destroyed = false;
        this.add_style_class_name('qryg-search-section');
        this.connect('destroy', () => (this._destroyed = true));

        this._topHeader = this._header('Top Hit', false);
        this._topSlot = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, visible: false});
        this._title = this._header(provider.displayName ?? provider.appInfo?.get_name() ?? 'Applications', true);
        this._content = new St.BoxLayout({style_class: 'list-search-results', orientation: Clutter.Orientation.VERTICAL, x_expand: true});

        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        for (const child of [this._topHeader, this._topSlot, this._title, this._content])
            box.add_child(child);
        this._resultDisplayBin.child = box;
    }

    _header(text, visible) {
        return new St.Label({style_class: 'qryg-search-section-header', text, visible});
    }

    updateSearch(providerResults, terms) {
        const results = providerResults.filter(id => this._context.scope.allows(this.provider, id));
        this._pruneExcept(new Set(results));
        return super.updateSearch(results, terms);
    }

    _pruneExcept(keep) {
        const selected = this._resultsView._defaultResult;
        const focus = global.stage.get_key_focus();
        for (const [id, row] of Object.entries(this._resultDisplays)) {
            if (keep.has(id) || row === selected || row === focus || (focus && row.contains(focus)))
                continue;
            if (row === this._topRow)
                this.setTopHit(null);
            delete this._resultDisplays[id];
            row.destroy();
        }
    }

    _getMaxDisplayedResults() {
        return this._context.config.maxRows;
    }

    clear() {
        this.setTopHit(null);
        super.clear();
    }

    _clearResultDisplay() {
        if (this._destroyed)
            return;
        this.setTopHit(null);
        this._content.remove_all_children();
    }

    _createResultDisplay(meta) {
        const useAnswerFirst = appInfoId(this.provider) === CALCULATOR_ID &&
            this._context.config.feature(Feature.CALCULATOR_STYLE);
        const row = new Search.ListSearchResult(this.provider, useAnswerFirst ? answerFirstCalculatorMeta(meta) : meta, this._resultsView);
        const activate = this.provider.id === 'applications'
            ? () => activateAppResult(meta.id)
            : row.activate.bind(row);
        row.activate = () => {
            if (this.provider.isGuide?.(meta.id)) {
                this.provider.fillGuide(meta.id);
                return;
            }
            activate();
            leaveOverview();
        };
        return row;
    }

    _addItem(row) {
        if (this._destroyed)
            return;
        this._content.add_child(row);
        this._title.visible = true;
    }

    getFirstResult() {
        return this._topRow ?? this._content.get_children().find(child => child.visible) ?? null;
    }

    hasRow(actor) {
        return Boolean(actor) && (this._topSlot.contains(actor) || this._content.contains(actor));
    }

    setTopHit(row) {
        if (this._topRow === row)
            return;
        if (this._topRow)
            this._demote(this._topRow);
        this._topRow = row;
        if (row)
            this._promote(row);
        this._topSlot.visible = row !== null;
        this._topHeader.visible = row !== null;
        this._title.visible = this._content.get_n_children() > 0;
    }

    _promote(row) {
        this._content.remove_child(row);
        this._topSlot.add_child(row);
        row.add_style_class_name('qryg-search-top-hit');
        rowIcon(row)?.set_icon_size(RowIconSize.TOP_HIT);
    }

    _demote(row) {
        this._topSlot.remove_child(row);
        row.remove_style_class_name('qryg-search-top-hit');
        rowIcon(row)?.set_icon_size(RowIconSize.ROW);
        this._content.insert_child_at_index(row, 0);
    }
});
