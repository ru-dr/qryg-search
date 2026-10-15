// SPDX-License-Identifier: GPL-3.0-or-later
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {buildKeyboardPage} from './prefs/keyboardPage.js';
import {buildAppearancePage} from './prefs/appearancePage.js';
import {buildFeaturesPage} from './prefs/featuresPage.js';
import {buildPluginsPage} from './prefs/pluginsPage.js';
import {buildBookmarksPage} from './prefs/bookmarksPage.js';
import {buildAboutPage} from './prefs/aboutPage.js';

const PAGES = [
    buildKeyboardPage,
    buildAppearancePage,
    buildFeaturesPage,
    buildPluginsPage,
    buildBookmarksPage,
    buildAboutPage,
];

export default class QrygSearchPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const context = {window, settings: this.getSettings(), path: this.path, metadata: this.metadata};
        for (const build of PAGES)
            window.add(build(context));
        window.set_search_enabled(true);
    }
}
