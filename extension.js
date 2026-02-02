/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const MUTTER_SCHEMA = 'org.gnome.mutter';
const WM_KEYBINDINGS_SCHEMA = 'org.gnome.desktop.wm.keybindings';
const SHELL_KEYBINDINGS_SCHEMA = 'org.gnome.shell.keybindings';
const DASH_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';

const GhostKeyManager = class {
    constructor(settings) {
        this._settings = settings;
        this._mutterSettings = new Gio.Settings({schema_id: MUTTER_SCHEMA});
        this._wmSettings = new Gio.Settings({schema_id: WM_KEYBINDINGS_SCHEMA});
        this._shellSettings = new Gio.Settings({schema_id: SHELL_KEYBINDINGS_SCHEMA});

        // dash-to-dock might not be installed
        this._dashSettings = null;
        try {
            this._dashSettings = new Gio.Settings({schema_id: DASH_SCHEMA});
        } catch (e) {
            // dash-to-dock is not installed, which is fine
            log(`GhostKey: dash-to-dock not available: ${e.message}`);
        }
    }

    _backupKey(settings, key, backupKey) {
        try {
            const value = settings.get_strv(key);
            this._settings.set_string(backupKey, JSON.stringify(value));
        } catch (e) {
            log(`GhostKey: Failed to backup ${key}: ${e}`);
        }
    }

    _backupStringKey(settings, key, backupKey) {
        try {
            const value = settings.get_string(key);
            this._settings.set_string(backupKey, value);
        } catch (e) {
            log(`GhostKey: Failed to backup ${key}: ${e}`);
        }
    }

    _backupBooleanKey(settings, key, backupKey) {
        try {
            const value = settings.get_boolean(key);
            this._settings.set_boolean(backupKey, value);
        } catch (e) {
            log(`GhostKey: Failed to backup ${key}: ${e}`);
        }
    }

    _restoreKey(settings, key, backupKey) {
        const backupValue = this._settings.get_string(backupKey);
        if (backupValue) {
            try {
                const value = JSON.parse(backupValue);
                settings.set_strv(key, value);
            } catch (e) {
                log(`GhostKey: Error restoring ${key}: ${e}`);
            }
        }
    }

    _restoreStringKey(settings, key, backupKey) {
        try {
            const backupValue = this._settings.get_string(backupKey);
            if (backupValue) {
                settings.set_string(key, backupValue);
            }
        } catch (e) {
            log(`GhostKey: Error restoring ${key}: ${e}`);
        }
    }

    _restoreBooleanKey(settings, key, backupKey) {
        try {
            const backupValue = this._settings.get_boolean(backupKey);
            settings.set_boolean(key, backupValue);
        } catch (e) {
            log(`GhostKey: Error restoring ${key}: ${e}`);
        }
    }

    backupAll() {
        // Backup Super key (overlay-key)
        if (this._settings.get_boolean('silence-super-key')) {
            this._backupStringKey(this._mutterSettings, 'overlay-key', 'original-overlay-key');
        }

        // Backup window menu
        if (this._settings.get_boolean('silence-window-menu')) {
            this._backupKey(this._wmSettings, 'activate-window-menu', 'original-window-menu');
        }

        // Backup input source
        if (this._settings.get_boolean('silence-input-source')) {
            this._backupKey(this._wmSettings, 'switch-input-source', 'original-input-source');
        }

        // Backup app view
        if (this._settings.get_boolean('silence-app-view')) {
            this._backupKey(this._shellSettings, 'toggle-application-view', 'original-app-view');
        }

        // Backup app shortcuts
        if (this._settings.get_boolean('silence-app-shortcuts')) {
            const appShortcuts = {};
            for (let i = 1; i <= 9; i++) {
                const openKey = `open-new-window-application-${i}`;
                const switchKey = `switch-to-application-${i}`;
                appShortcuts[openKey] = this._shellSettings.get_strv(openKey);
                appShortcuts[switchKey] = this._shellSettings.get_strv(switchKey);
            }
            this._settings.set_string('original-app-shortcuts', JSON.stringify(appShortcuts));
        }

        // Backup dash hotkeys
        if (this._dashSettings && this._settings.get_boolean('silence-dash-hotkeys')) {
            this._backupBooleanKey(this._dashSettings, 'hot-keys', 'original-dash-hotkeys');
        }
    }

    silenceAll() {
        // Silence Super key
        if (this._settings.get_boolean('silence-super-key')) {
            try {
                this._mutterSettings.set_string('overlay-key', '');
            } catch (e) {
                log(`GhostKey: Failed to silence Super key: ${e}`);
            }
        }

        // Silence window menu
        if (this._settings.get_boolean('silence-window-menu')) {
            try {
                this._wmSettings.set_strv('activate-window-menu', []);
            } catch (e) {
                log(`GhostKey: Failed to silence window menu: ${e}`);
            }
        }

        // Silence input source
        if (this._settings.get_boolean('silence-input-source')) {
            try {
                this._wmSettings.set_strv('switch-input-source', []);
            } catch (e) {
                log(`GhostKey: Failed to silence input source: ${e}`);
            }
        }

        // Silence app view
        if (this._settings.get_boolean('silence-app-view')) {
            try {
                this._shellSettings.set_strv('toggle-application-view', []);
            } catch (e) {
                log(`GhostKey: Failed to silence app view: ${e}`);
            }
        }

        // Silence app shortcuts
        if (this._settings.get_boolean('silence-app-shortcuts')) {
            for (let i = 1; i <= 9; i++) {
                try {
                    this._shellSettings.set_strv(`open-new-window-application-${i}`, []);
                    this._shellSettings.set_strv(`switch-to-application-${i}`, []);
                } catch (e) {
                    log(`GhostKey: Failed to silence app shortcut ${i}: ${e}`);
                }
            }
        }

        // Silence dash hotkeys
        if (this._dashSettings && this._settings.get_boolean('silence-dash-hotkeys')) {
            try {
                this._dashSettings.set_boolean('hot-keys', false);
            } catch (e) {
                log(`GhostKey: Failed to silence dash hotkeys: ${e}`);
            }
        }
    }

    restoreAll() {
        // Restore Super key
        if (this._settings.get_boolean('silence-super-key')) {
            this._restoreStringKey(this._mutterSettings, 'overlay-key', 'original-overlay-key');
        }

        // Restore window menu
        if (this._settings.get_boolean('silence-window-menu')) {
            this._restoreKey(this._wmSettings, 'activate-window-menu', 'original-window-menu');
        }

        // Restore input source
        if (this._settings.get_boolean('silence-input-source')) {
            this._restoreKey(this._wmSettings, 'switch-input-source', 'original-input-source');
        }

        // Restore app view
        if (this._settings.get_boolean('silence-app-view')) {
            this._restoreKey(this._shellSettings, 'toggle-application-view', 'original-app-view');
        }

        // Restore app shortcuts
        if (this._settings.get_boolean('silence-app-shortcuts')) {
            const backupValue = this._settings.get_string('original-app-shortcuts');
            if (backupValue) {
                try {
                    const shortcuts = JSON.parse(backupValue);
                    for (const [key, value] of Object.entries(shortcuts)) {
                        this._shellSettings.set_strv(key, value);
                    }
                } catch (e) {
                    log(`GhostKey: Error restoring app shortcuts: ${e}`);
                }
            }
        }

        // Restore dash hotkeys
        if (this._dashSettings && this._settings.get_boolean('silence-dash-hotkeys')) {
            this._restoreBooleanKey(this._dashSettings, 'hot-keys', 'original-dash-hotkeys');
        }
    }

    destroy() {
        // Settings will be garbage collected
    }
};

const GhostKeyToggle = GObject.registerClass(
class GhostKeyToggle extends QuickMenuToggle {
    _init(extension) {
        super._init({
            title: _('Ghost Key'),
            iconName: 'input-keyboard-symbolic',
            toggleMode: true,
        });

        this._extension = extension;
        this._settings = extension.getSettings();
        this._manager = new GhostKeyManager(this._settings);

        // Track ghost mode state separately from UI state
        // Initialize based on current settings
        this._ghostModeActive = this._settings.get_boolean('ghost-mode-enabled');

        // Bind toggle to settings
        this._settings.bind('ghost-mode-enabled',
            this, 'checked',
            Gio.SettingsBindFlags.DEFAULT);

        // Connect toggle signal
        this.connect('notify::checked', () => {
            if (this.checked) {
                this._enableGhostMode();
            } else {
                this._disableGhostMode();
            }
        });

        // If ghost mode was already active, we need to re-silence keys
        // (in case keys were restored by crash recovery)
        if (this._ghostModeActive) {
            log('GhostKey: Ghost mode was active, re-silencing keys');
            this._manager.silenceAll();
        }

        // Build the menu
        this._buildMenu();
    }

    _buildMenu() {
        // Set menu header
        this.menu.setHeader('input-keyboard-symbolic', _('Ghost Key'),
            _('Select keys to silence'));

        // Super key toggle - prevent menu from closing
        this._superKeyItem = new PopupMenu.PopupSwitchMenuItem(_('Super Key'),
            this._settings.get_boolean('silence-super-key'));
        this._superKeyItem.connect('toggled', (item) => {
            this._settings.set_boolean('silence-super-key', item.state);
        });
        // Override activate to prevent menu from closing
        this._superKeyItem.activate = () => {
            this._superKeyItem.toggle();
        };
        this.menu.addMenuItem(this._superKeyItem);

        // Window menu toggle
        this._windowMenuItem = new PopupMenu.PopupSwitchMenuItem(_('Window Menu'),
            this._settings.get_boolean('silence-window-menu'));
        this._windowMenuItem.connect('toggled', (item) => {
            this._settings.set_boolean('silence-window-menu', item.state);
        });
        this._windowMenuItem.activate = () => {
            this._windowMenuItem.toggle();
        };
        this.menu.addMenuItem(this._windowMenuItem);

        // Input source toggle
        this._inputSourceItem = new PopupMenu.PopupSwitchMenuItem(_('Input Source Switch'),
            this._settings.get_boolean('silence-input-source'));
        this._inputSourceItem.connect('toggled', (item) => {
            this._settings.set_boolean('silence-input-source', item.state);
        });
        this._inputSourceItem.activate = () => {
            this._inputSourceItem.toggle();
        };
        this.menu.addMenuItem(this._inputSourceItem);

        // App view toggle
        this._appViewItem = new PopupMenu.PopupSwitchMenuItem(_('Application View'),
            this._settings.get_boolean('silence-app-view'));
        this._appViewItem.connect('toggled', (item) => {
            this._settings.set_boolean('silence-app-view', item.state);
        });
        this._appViewItem.activate = () => {
            this._appViewItem.toggle();
        };
        this.menu.addMenuItem(this._appViewItem);

        // App shortcuts toggle
        this._appShortcutsItem = new PopupMenu.PopupSwitchMenuItem(_('App Shortcuts (1-9)'),
            this._settings.get_boolean('silence-app-shortcuts'));
        this._appShortcutsItem.connect('toggled', (item) => {
            this._settings.set_boolean('silence-app-shortcuts', item.state);
        });
        this._appShortcutsItem.activate = () => {
            this._appShortcutsItem.toggle();
        };
        this.menu.addMenuItem(this._appShortcutsItem);

        // Dash hotkeys toggle (only if dash-to-dock is available)
        if (this._manager._dashSettings) {
            this._dashHotkeysItem = new PopupMenu.PopupSwitchMenuItem(_('Dash Hotkeys'),
                this._settings.get_boolean('silence-dash-hotkeys'));
            this._dashHotkeysItem.connect('toggled', (item) => {
                this._settings.set_boolean('silence-dash-hotkeys', item.state);
            });
            this._dashHotkeysItem.activate = () => {
                this._dashHotkeysItem.toggle();
            };
            this.menu.addMenuItem(this._dashHotkeysItem);
        }

    }

    _enableGhostMode() {
        if (this._ghostModeActive) {
            log('GhostKey: Ghost mode already active, skipping');
            return;
        }
        log('GhostKey: Enabling ghost mode...');
        this._manager.backupAll();
        this._manager.silenceAll();
        this._ghostModeActive = true;
        this._settings.set_boolean('ghost-mode-enabled', true);
        log('GhostKey: Ghost mode enabled');
    }

    _disableGhostMode() {
        if (!this._ghostModeActive) {
            log('GhostKey: Ghost mode already inactive, skipping');
            return;
        }
        log('GhostKey: Disabling ghost mode...');
        this._manager.restoreAll();
        this._ghostModeActive = false;
        this._settings.set_boolean('ghost-mode-enabled', false);
        log('GhostKey: Ghost mode disabled');
    }

    destroy() {
        log('GhostKey: Destroying toggle, checked=' + this.checked);
        // Always restore keys when destroying to prevent getting stuck
        // Use a local flag to track if we need to restore
        if (this._ghostModeActive) {
            log('GhostKey: Restoring keys during destroy');
            this._manager.restoreAll();
        }
        this._manager.destroy();
        super.destroy();
    }
});

const GhostKeyIndicator = GObject.registerClass(
class GhostKeyIndicator extends SystemIndicator {
    constructor(extension) {
        super();

        this._extension = extension;
        this._settings = extension.getSettings();

        // Add indicator icon
        this._indicator = this._addIndicator();
        this._indicator.iconName = 'input-keyboard-symbolic';

        // Create toggle
        this._toggle = new GhostKeyToggle(extension);

        // Bind indicator visibility to toggle state
        this._toggle.bind_property('checked',
            this._indicator, 'visible',
            GObject.BindingFlags.SYNC_CREATE);

        this.quickSettingsItems.push(this._toggle);
    }

    destroy() {
        this._toggle.destroy();
        super.destroy();
    }
});

export default class GhostKeyExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        // Check if ghost mode was previously active but keys were not restored
        // This can happen if gnome-shell crashed, extension was disabled unexpectedly, or system rebooted
        const wasEnabled = this._settings.get_boolean('ghost-mode-enabled');
        if (wasEnabled) {
            log('GhostKey: Ghost mode was active on last run, restoring keys now');
            // Create a temporary manager to restore keys from backups
            const manager = new GhostKeyManager(this._settings);
            manager.restoreAll();
            manager.destroy();
            // Reset the flag so we start fresh
            this._settings.set_boolean('ghost-mode-enabled', false);
            log('GhostKey: Keys restored from previous session');
        }

        this._indicator = new GhostKeyIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        // Safety check: if ghost mode is still active, restore keys before destroying
        // This handles cases where the toggle's destroy might not complete properly
        if (this._settings.get_boolean('ghost-mode-enabled')) {
            log('GhostKey: Extension disabled while ghost mode active, restoring keys');
            const manager = new GhostKeyManager(this._settings);
            manager.restoreAll();
            manager.destroy();
            this._settings.set_boolean('ghost-mode-enabled', false);
        }

        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
