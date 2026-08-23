/**
 * Ghost Key Extension - Main Entry Point
 *
 * Silences system hotkeys with backup and restore functionality.
 * Compatible with GNOME Shell 48+.
 */

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { KeyManager } from './keyManager.js';
import { GhostKeyIndicator } from './indicator.js';
import { Logger } from './constants.js';

export default class GhostKeyExtension extends Extension {
    enable() {
        Logger.info('Enabling Ghost Key extension...');
        this._settings = this.getSettings();
        this._keyManager = new KeyManager(this._settings);

        // Safe recovery if previous session was interrupted or crashed
        this._keyManager.recoverFromCrashIfNeeded();

        // Create indicator and register with QuickSettings
        this._indicator = new GhostKeyIndicator(this, this._keyManager);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        Logger.info('Ghost Key extension enabled.');
    }

    disable() {
        Logger.info('Disabling Ghost Key extension...');

        if (this._keyManager) {
            if (this._keyManager.isGhostModeActive) {
                Logger.info('Restoring hotkeys before extension shutdown...');
                this._keyManager.disableGhostMode();
            }
            this._keyManager.destroy();
            this._keyManager = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;
        Logger.info('Ghost Key extension disabled cleanly.');
    }
}
