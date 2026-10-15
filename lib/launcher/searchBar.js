// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';
import {FilterMode} from '../results/scope.js';

export const FILTERS = Object.freeze([
    {mode: FilterMode.APPS, icon: 'view-app-grid-symbolic', hint: 'Search Apps'},
    {mode: FilterMode.FILES, icon: 'folder-symbolic', hint: 'Search Files'},
    {mode: FilterMode.ACTIONS, icon: 'system-run-symbolic', hint: 'Search Actions'},
    {mode: FilterMode.CLIPBOARD, icon: 'edit-paste-symbolic', hint: 'Search Clipboard'},
]);

const SEARCH_ICON = 'edit-find-symbolic';
const RESULT_ICON_CLASS = 'qryg-search-bar-result-icon';
const MIN_GHOST_WIDTH = 40;

export class SearchBar {
    constructor({onFilterClicked}) {
        this.actor = new St.Widget({style_class: 'qryg-search-bar', layout_manager: new Clutter.BinLayout(), x_expand: true});
        this._row = new St.BoxLayout({x_expand: true});
        this._filters = new St.BoxLayout({style_class: 'qryg-search-filters', y_align: Clutter.ActorAlign.CENTER});
        this._buttons = new Map(FILTERS.map((filter, index) => [filter.mode, this._filterButton(filter, index, onFilterClicked)]));
        for (const button of this._buttons.values())
            this._filters.add_child(button);
        this._ghost = new St.Label({style_class: 'qryg-search-ghost', x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.START, visible: false});
        this._ghost.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._icon = new St.Icon({style_class: 'search-entry-icon', icon_name: SEARCH_ICON});
        this.actor.add_child(this._row);
        this.actor.add_child(this._ghost);
    }

    _filterButton(filter, index, onClicked) {
        const button = new St.Button({
            style_class: 'qryg-search-filter-button',
            can_focus: false,
            accessible_name: `${filter.hint} (Super+${index + 1})`,
            child: new St.Icon({icon_name: filter.icon, style_class: 'qryg-search-filter-icon'}),
        });
        button.connect('clicked', () => onClicked(filter.mode));
        return button;
    }

    takeIcon(entry) {
        this._originalIcon = entry.get_primary_icon();
        entry.set_primary_icon(this._icon);
    }

    returnIcon(entry) {
        entry.set_primary_icon(this._originalIcon);
        this._originalIcon = null;
    }

    attach(entry) {
        entry.x_expand = true;
        this._row.add_child(entry);
        this._row.add_child(this._filters);
    }

    detach(entry) {
        if (entry.get_parent() === this._row)
            this._row.remove_child(entry);
        if (this._filters.get_parent() === this._row)
            this._row.remove_child(this._filters);
    }

    configureFilters({visible, available}) {
        this._filters.visible = visible;
        for (const [mode, button] of this._buttons)
            button.visible = available(mode);
    }

    isFilterAvailable(mode) {
        return this._filters.visible && this._buttons.get(mode)?.visible;
    }

    markActiveFilter(mode) {
        for (const [m, button] of this._buttons) {
            if (m === mode)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
    }

    setResultIcon(gicon) {
        if (gicon) {
            this._icon.gicon = gicon;
            this._icon.add_style_class_name(RESULT_ICON_CLASS);
        } else {
            this._icon.icon_name = SEARCH_ICON;
            this._icon.remove_style_class_name(RESULT_ICON_CLASS);
        }
    }

    showGhost(entry, text) {
        const clutterText = entry.clutter_text;
        const [ok, x] = clutterText.position_to_coords(-1);
        if (!ok || !text) {
            this.hideGhost();
            return;
        }
        const origin = clutterText.apply_relative_transform_to_point(this.actor, new Graphene.Point3D({x, y: 0, z: 0}));
        const clear = entry.get_secondary_icon();
        const right = this._row.x + entry.x + entry.width - (clear?.visible ? clear.width + 12 : 8);
        const width = right - origin.x;
        if (width < MIN_GHOST_WIDTH) {
            this.hideGhost();
            return;
        }
        this._ghost.text = text;
        this._ghost.set_position(Math.round(origin.x), Math.round(origin.y));
        this._ghost.width = width;
        this._ghost.show();
    }

    hideGhost() {
        this._ghost.hide();
    }

    destroy() {
        this.actor.destroy();
    }
}
