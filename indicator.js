/**
 * Ghost Key Extension - QuickSettings Indicator & Menu
 *
 * Implements the GNOME 48 QuickSettings toggle, custom submenu switches,
 * panel indicator icon, and lifecycle cleanup.
 */

import GObject from 'gi://GObject';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { KEYBINDINGS, SETTINGS_KEYS, Logger } from './constants.js';

export const GhostKeyToggle = GObject.registerClass(
class GhostKeyToggle extends QuickMenuToggle {
    _init(extension, keyManager) {
        super._init({
            title: _('Ghost Key'),
            iconName: 'input-keyboard-symbolic',
            toggleMode: true,
        });

        this._extension = extension;
        this._settings = extension.getSettings();
        this._keyManager = keyManager;
        this._signals = [];

        // Set initial state from keyManager
        this.checked = this._keyManager.isGhostModeActive;

        // Handle user clicks on the QuickMenu toggle button
        const clickedId = this.connect('clicked', () => {
            if (this.checked) {
                this._keyManager.enableGhostMode();
            } else {
                this._keyManager.disableGhostMode();
            }
        });
        this._signals.push({ object: this, id: clickedId });

        // Keep toggle in sync if setting is modified externally
        const ghostModeChangedId = this._settings.connect(
            `changed::${SETTINGS_KEYS.GHOST_MODE_ENABLED}`,
            () => {
                const isActive = this._settings.get_boolean(SETTINGS_KEYS.GHOST_MODE_ENABLED);
                if (this.checked !== isActive) {
                    this.checked = isActive;
                }
            }
        );
        this._signals.push({ object: this._settings, id: ghostModeChangedId });

        this._buildMenu();
    }

    _buildMenu() {
        this.menu.setHeader('input-keyboard-symbolic', _('Ghost Key'), _('Select keys to disable'));

        for (const binding of KEYBINDINGS) {
            const item = this._createSwitchItem(binding.id, _(binding.label));
            this.menu.addMenuItem(item);
        }
    }

    _createSwitchItem(settingId, label) {
        const item = new PopupMenu.PopupSwitchMenuItem(
            label,
            this._settings.get_boolean(settingId)
        );

        // Synchronize UI toggle with GSettings
        const toggledId = item.connect('toggled', switchItem => {
            this._settings.set_boolean(settingId, switchItem.state);
        });
        this._signals.push({ object: item, id: toggledId });

        // Synchronize GSettings changes with UI toggle
        const changedId = this._settings.connect(`changed::${settingId}`, () => {
            const currentVal = this._settings.get_boolean(settingId);
            if (item.state !== currentVal) {
                item.setToggleState(currentVal);
            }
        });
        this._signals.push({ object: this._settings, id: changedId });

        return item;
    }

    destroy() {
        for (const { object, id } of this._signals) {
            try {
                if (object && id) {
                    object.disconnect(id);
                }
            } catch (e) {
                Logger.debug('Signal disconnection warning:', e);
            }
        }
        this._signals = [];
        this._keyManager = null;
        this._settings = null;
        this._extension = null;

        super.destroy();
    }
});

export const GhostKeyIndicator = GObject.registerClass(
class GhostKeyIndicator extends SystemIndicator {
    _init(extension, keyManager) {
        super._init();

        this._indicator = this._addIndicator();
        this._indicator.iconName = 'input-keyboard-symbolic';

        this._toggle = new GhostKeyToggle(extension, keyManager);

        // Bind panel indicator icon visibility to toggle checked state
        this._toggle.bind_property(
            'checked',
            this._indicator,
            'visible',
            GObject.BindingFlags.SYNC_CREATE
        );

        this.quickSettingsItems.push(this._toggle);
    }

    destroy() {
        if (this._toggle) {
            this._toggle.destroy();
            this._toggle = null;
        }
        super.destroy();
    }
});
