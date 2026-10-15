// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Patcher} from '../core/patcher.js';

const STOLEN_CLASS = 'qryg-search-entry-stolen';
const RESULTS_CLASS = 'qryg-search-results';
const CLEAR_ICON_CLASS = 'qryg-search-clear-icon';
const SHORTCUT_MODIFIERS = Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK |
    Clutter.ModifierType.SUPER_MASK | Clutter.ModifierType.MOD4_MASK;

function detach(actor) {
    actor.get_parent()?.remove_child(actor);
}

export class SearchTakeover {
    constructor({isOpen, onOverviewToggle, onActivate}) {
        this._isOpen = isOpen;
        this._onOverviewToggle = onOverviewToggle;
        this._onActivate = onActivate;
        this._patcher = new Patcher();
        this.entry = null;
        this.controller = null;
        this.view = null;
    }

    enable() {
        this.entry = Main.overview.searchEntry;
        this.controller = Main.overview.searchController;
        this.view = this.controller._searchResults;
        this._entryParent = this.entry.get_parent();
        this._hintText = this.entry.hint_text;
        this._controllerParent = this.controller.get_parent();

        this._patchOverview();
        this._patchController();
        this._patchView();
        this._detachWidgets();
        global.stage.connectObject('captured-event', (_stage, event) => this._swallowOverviewTyping(event), this);
    }

    disable() {
        global.stage.disconnectObject(this);
        this._patcher.restoreAll();
        this._attachWidgets();
        this.entry = this.controller = this.view = null;
    }

    _patchOverview() {
        this._patcher.replace(Main.overview, 'toggle', original => () => {
            if (this._isOpen())
                this._onOverviewToggle();
            else
                original.call(Main.overview);
        });
        const controlsLayout = Main.overview._overview?._controls?.layout_manager;
        if (controlsLayout?._searchController === this.controller)
            this._patcher.set(controlsLayout, '_searchController', {allocate() {}});
    }

    _patchController() {
        this._patcher.set(this.controller, '_searchCancelled', () => {});
    }

    _patchView() {
        const view = this.view;
        this._patcher.replace(view, 'activateDefault', original => () => {
            this._onActivate();
            original.call(view);
        });
        if (view.activate) {
            this._patcher.replace(view, 'activate', original => (...args) => {
                this._onActivate();
                original.call(view, ...args);
            });
        }
    }

    _detachWidgets() {
        this.entry.add_style_class_name(STOLEN_CLASS);
        detach(this.entry);
        this.entry.visible = false;
        detach(this.controller);
        this.controller.hide();
        this.view.add_style_class_name(RESULTS_CLASS);
        this.view._statusContainer.remove_child(this.view._statusSpinner);
        this.controller._clearIcon.add_style_class_name(CLEAR_ICON_CLASS);
    }

    _attachWidgets() {
        const view = Main.overview.searchController._searchResults;
        view._statusContainer.insert_child_at_index(view._statusSpinner, 0);
        view.remove_style_class_name(RESULTS_CLASS);
        Main.overview.searchController._clearIcon.remove_style_class_name(CLEAR_ICON_CLASS);

        const entry = Main.overview.searchEntry;
        entry.remove_style_class_name(STOLEN_CLASS);
        entry.hint_text = this._hintText;
        entry.visible = true;
        detach(entry);
        this._entryParent.add_child(entry);

        const controller = Main.overview.searchController;
        detach(controller);
        this._controllerParent.add_child(controller);
    }

    _swallowOverviewTyping(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS || !Main.overview.visible || this._isOpen())
            return Clutter.EVENT_PROPAGATE;
        if (event.get_state() & SHORTCUT_MODIFIERS)
            return Clutter.EVENT_PROPAGATE;
        if (global.stage.get_key_focus() instanceof Clutter.Text)
            return Clutter.EVENT_PROPAGATE;
        const printable = Clutter.keysym_to_unicode(event.get_key_symbol()) >= 0x20;
        return printable ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
    }
}
