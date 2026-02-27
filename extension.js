import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';

const SCHEMAS = {
    mutter: 'org.gnome.mutter',
    wm: 'org.gnome.desktop.wm.keybindings',
    shell: 'org.gnome.shell.keybindings',
    dash: 'org.gnome.shell.extensions.dash-to-dock',
};

const KEYBINDINGS = [
    { id: 'disable-overlay-key', schema: 'mutter', key: 'overlay-key', backup: 'original-overlay-key', type: 'string', value: '' },
    { id: 'disable-window-menu-shortcut', schema: 'wm', key: 'activate-window-menu', backup: 'original-window-menu', type: 'array' },
    { id: 'disable-input-source-shortcut', schema: 'wm', key: 'switch-input-source', backup: 'original-input-source', type: 'array' },
    { id: 'disable-app-view-shortcut', schema: 'shell', key: 'toggle-application-view', backup: 'original-app-view', type: 'array' },
    { id: 'disable-app-shortcuts', schema: 'shell', key: 'app-shortcuts', backup: 'original-app-shortcuts', type: 'array-multi', keys: ['open-new-window-application-', 'switch-to-application-'] },
    { id: 'disable-dash-hotkeys', schema: 'dash', key: 'hot-keys', backup: 'original-dash-hotkeys', type: 'boolean', value: false },
];

const GhostKeyManager = class {
    constructor (settings) {
        this._settings = settings;
        this._schemas = {
            mutter: new Gio.Settings({ schema_id: SCHEMAS.mutter }),
            wm: new Gio.Settings({ schema_id: SCHEMAS.wm }),
            shell: new Gio.Settings({ schema_id: SCHEMAS.shell }),
        };
        try {
            this._schemas.dash = new Gio.Settings({ schema_id: SCHEMAS.dash });
        } catch (e) {
            log(`GhostKey: dash-to-dock not available: ${e.message}`);
        }
    }

    _getSettings (schema) {
        return this._schemas[schema];
    }

    _backup (binding) {
        const settings = this._getSettings(binding.schema);
        if (!settings) return;

        try {
            if (binding.type === 'array-multi') {
                const shortcuts = {};
                for (let i = 1; i <= 9; i++) {
                    const openKey = `${binding.keys[0]}${i}`;
                    const switchKey = `${binding.keys[1]}${i}`;
                    shortcuts[openKey] = settings.get_strv(openKey);
                    shortcuts[switchKey] = settings.get_strv(switchKey);
                }
                this._settings.set_string(binding.backup, JSON.stringify(shortcuts));
            } else if (binding.type === 'string') {
                this._settings.set_string(binding.backup, settings.get_string(binding.key));
            } else if (binding.type === 'array') {
                this._settings.set_string(binding.backup, JSON.stringify(settings.get_strv(binding.key)));
            } else if (binding.type === 'boolean') {
                this._settings.set_boolean(binding.backup, settings.get_boolean(binding.key));
            }
        } catch (e) {
            log(`GhostKey: Failed to backup ${binding.key}: ${e}`);
        }
    }

    _silence (binding) {
        const settings = this._getSettings(binding.schema);
        if (!settings) return;

        try {
            if (binding.type === 'array-multi') {
                for (let i = 1; i <= 9; i++) {
                    settings.set_strv(`${binding.keys[0]}${i}`, []);
                    settings.set_strv(`${binding.keys[1]}${i}`, []);
                }
            } else if (binding.type === 'string') {
                settings.set_string(binding.key, binding.value);
            } else if (binding.type === 'array') {
                settings.set_strv(binding.key, []);
            } else if (binding.type === 'boolean') {
                settings.set_boolean(binding.key, binding.value);
            }
        } catch (e) {
            log(`GhostKey: Failed to disable ${binding.key}: ${e}`);
        }
    }

    _restore (binding) {
        const settings = this._getSettings(binding.schema);
        if (!settings) return;

        try {
            if (binding.type === 'array-multi') {
                const backupValue = this._settings.get_string(binding.backup);
                if (backupValue) {
                    const shortcuts = JSON.parse(backupValue);
                    for (const [key, value] of Object.entries(shortcuts)) {
                        settings.set_strv(key, value);
                    }
                }
            } else if (binding.type === 'string') {
                const backupValue = this._settings.get_string(binding.backup);
                if (backupValue) settings.set_string(binding.key, backupValue);
            } else if (binding.type === 'array') {
                const backupValue = this._settings.get_string(binding.backup);
                if (backupValue) settings.set_strv(binding.key, JSON.parse(backupValue));
            } else if (binding.type === 'boolean') {
                const backupValue = this._settings.get_boolean(binding.backup);
                settings.set_boolean(binding.key, backupValue);
            }
        } catch (e) {
            log(`GhostKey: Error restoring ${binding.key}: ${e}`);
        }
    }

    _processBindings (method) {
        KEYBINDINGS.forEach(binding => {
            if (binding.schema === 'dash' && !this._schemas.dash) return;
            if (this._settings.get_boolean(binding.id)) {
                this[method](binding);
            }
        });
    }

    backupAll () { this._processBindings('_backup'); }
    silenceAll () { this._processBindings('_silence'); }
    restoreAll () { this._processBindings('_restore'); }
    destroy () { }
};

const createSwitchItem = (settings, id, label) => {
    const item = new PopupMenu.PopupSwitchMenuItem(label, settings.get_boolean(id));
    item.connect('toggled', item => settings.set_boolean(id, item.state));
    item.activate = () => item.toggle();
    return item;
};

const GhostKeyToggle = GObject.registerClass(
    class GhostKeyToggle extends QuickMenuToggle {
        _init (extension) {
            super._init({
                title: _('Ghost Key'),
                iconName: 'input-keyboard-symbolic',
                toggleMode: true,
            });

            this._extension = extension;
            this._settings = extension.getSettings();
            this._manager = new GhostKeyManager(this._settings);
            this._ghostModeActive = this._settings.get_boolean('ghost-mode-enabled');

            this._settings.bind('ghost-mode-enabled', this, 'checked', Gio.SettingsBindFlags.DEFAULT);

            this.connect('notify::checked', () => this.checked ? this._enableGhostMode() : this._disableGhostMode());

            if (this._ghostModeActive) {
                log('GhostKey: Ghost mode was active, re-disabling keys');
                this._manager.silenceAll();
            }

            this._buildMenu();
        }

        _buildMenu () {
            this.menu.setHeader('input-keyboard-symbolic', _('Ghost Key'), _('Select keys to disable'));

            const items = [
                { id: 'disable-overlay-key', label: _('Super Key') },
                { id: 'disable-window-menu-shortcut', label: _('Window Menu') },
                { id: 'disable-input-source-shortcut', label: _('Input Source Switch') },
                { id: 'disable-app-view-shortcut', label: _('Application View') },
                { id: 'disable-app-shortcuts', label: _('App Shortcuts (1-9)') },
            ];

            items.forEach(({ id, label }) => {
                this.menu.addMenuItem(createSwitchItem(this._settings, id, label));
            });

            if (this._manager._schemas.dash) {
                this.menu.addMenuItem(createSwitchItem(this._settings, 'disable-dash-hotkeys', _('Dash Hotkeys')));
            }
        }

        _enableGhostMode () {
            if (this._ghostModeActive) return;
            log('GhostKey: Enabling ghost mode...');
            this._manager.backupAll();
            this._manager.silenceAll();
            this._ghostModeActive = true;
            this._settings.set_boolean('ghost-mode-enabled', true);
            log('GhostKey: Ghost mode enabled');
        }

        _disableGhostMode () {
            if (!this._ghostModeActive) return;
            log('GhostKey: Disabling ghost mode...');
            this._manager.restoreAll();
            this._ghostModeActive = false;
            this._settings.set_boolean('ghost-mode-enabled', false);
            log('GhostKey: Ghost mode disabled');
        }

        destroy () {
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
        constructor (extension) {
            super();
            this._extension = extension;
            this._indicator = this._addIndicator();
            this._indicator.iconName = 'input-keyboard-symbolic';
            this._toggle = new GhostKeyToggle(extension);
            this._toggle.bind_property('checked', this._indicator, 'visible', GObject.BindingFlags.SYNC_CREATE);
            this.quickSettingsItems.push(this._toggle);
        }

        destroy () {
            this._toggle.destroy();
            super.destroy();
        }
    });

export default class GhostKeyExtension extends Extension {
    enable () {
        this._settings = this.getSettings();

        if (this._settings.get_boolean('ghost-mode-enabled')) {
            log('GhostKey: Ghost mode was active on last run, restoring keys now');
            const manager = new GhostKeyManager(this._settings);
            manager.restoreAll();
            manager.destroy();
            this._settings.set_boolean('ghost-mode-enabled', false);
            log('GhostKey: Keys restored from previous session');
        }

        this._indicator = new GhostKeyIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable () {
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
