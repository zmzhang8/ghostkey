/**
 * Ghost Key Extension - Key Manager
 *
 * Handles schema validation, key backup, silencing, restoration,
 * dynamic toggle synchronization, and crash recovery.
 */

import Gio from 'gi://Gio';
import {
    SCHEMAS,
    SETTINGS_KEYS,
    BINDING_TYPES,
    KEYBINDINGS,
    Logger,
} from './constants.js';

export function isSchemaAvailable(schemaId) {
    try {
        const schemaSource = Gio.SettingsSchemaSource.get_default();
        if (!schemaSource) return false;
        return schemaSource.lookup(schemaId, true) !== null;
    } catch (e) {
        return false;
    }
}

export function safeJsonParse(jsonStr, fallback = null) {
    if (typeof jsonStr !== 'string' || !jsonStr.trim()) return fallback;
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        Logger.error(`Failed to parse JSON string: "${jsonStr}"`, e);
        return fallback;
    }
}

export class KeyManager {
    constructor(ghostSettings, targetSchemas = null) {
        this._ghostSettings = ghostSettings;
        this._schemas = {};
        this._changedSignalId = null;

        if (targetSchemas) {
            this._schemas = targetSchemas;
        } else {
            this._initSchemas();
        }

        this._setupSettingsListener();
    }

    get isGhostModeActive() {
        return this._ghostSettings
            ? this._ghostSettings.get_boolean(SETTINGS_KEYS.GHOST_MODE_ENABLED)
            : false;
    }

    _initSchemas() {
        const requiredSchemas = [
            { key: SCHEMAS.MUTTER, id: SCHEMAS.MUTTER },
            { key: SCHEMAS.WM, id: SCHEMAS.WM },
            { key: SCHEMAS.SHELL, id: SCHEMAS.SHELL },
        ];

        for (const { key, id } of requiredSchemas) {
            if (isSchemaAvailable(id)) {
                this._schemas[key] = new Gio.Settings({ schema_id: id });
            } else {
                Logger.warn(`Schema "${id}" is not available on this system.`);
            }
        }
    }

    _getSchema(schemaId) {
        return this._schemas[schemaId] || null;
    }

    _getActiveBackups() {
        const raw = this._ghostSettings.get_string('original-keybindings-backup');
        const parsed = safeJsonParse(raw, {});
        return parsed && typeof parsed === 'object' ? parsed : {};
    }

    _saveActiveBackups(backups) {
        try {
            const json = JSON.stringify(backups || {});
            this._ghostSettings.set_string('original-keybindings-backup', json);
        } catch (e) {
            Logger.error('Failed to save active backups index:', e);
        }
    }

    _setupSettingsListener() {
        if (!this._ghostSettings) return;

        this._changedSignalId = this._ghostSettings.connect('changed', (_settings, key) => {
            if (key === SETTINGS_KEYS.GHOST_MODE_ENABLED) return;

            const binding = KEYBINDINGS.find(b => b.id === key);
            if (!binding) return;

            if (this.isGhostModeActive) {
                const isEnabled = this._ghostSettings.get_boolean(key);
                const activeBackups = this._getActiveBackups();

                if (isEnabled) {
                    Logger.info(`Setting "${binding.label}" enabled while Ghost Mode is active; muting.`);
                    this._backupBinding(binding, activeBackups);
                    this._silenceBinding(binding);
                } else {
                    Logger.info(`Setting "${binding.label}" disabled while Ghost Mode is active; restoring.`);
                    this._restoreBinding(binding, activeBackups);
                }

                this._saveActiveBackups(activeBackups);
            }
        });
    }

    _backupBinding(binding, activeBackups = null) {
        const targetSettings = this._getSchema(binding.schema);
        if (!targetSettings) return false;

        try {
            let backupData = null;

            switch (binding.type) {
                case BINDING_TYPES.STRING: {
                    const val = targetSettings.get_string(binding.key);
                    this._ghostSettings.set_string(binding.backupKey, val);
                    backupData = val;
                    break;
                }
                case BINDING_TYPES.ARRAY: {
                    const val = targetSettings.get_strv(binding.key);
                    this._ghostSettings.set_string(binding.backupKey, JSON.stringify(val));
                    backupData = val;
                    break;
                }
                case BINDING_TYPES.ARRAY_GROUP: {
                    const map = {};
                    for (const k of binding.keys) {
                        map[k] = targetSettings.get_strv(k);
                    }
                    this._ghostSettings.set_string(binding.backupKey, JSON.stringify(map));
                    backupData = map;
                    break;
                }
                case BINDING_TYPES.APP_SHORTCUTS: {
                    const map = {};
                    for (let i = 1; i <= binding.count; i++) {
                        for (const prefix of binding.keyPrefixes) {
                            const k = `${prefix}${i}`;
                            map[k] = targetSettings.get_strv(k);
                        }
                    }
                    this._ghostSettings.set_string(binding.backupKey, JSON.stringify(map));
                    backupData = map;
                    break;
                }
                case BINDING_TYPES.BOOLEAN: {
                    const val = targetSettings.get_boolean(binding.key);
                    this._ghostSettings.set_boolean(binding.backupKey, val);
                    backupData = val;
                    break;
                }
            }

            if (activeBackups) {
                activeBackups[binding.id] = {
                    type: binding.type,
                    schema: binding.schema,
                    data: backupData,
                };
            }
            return true;
        } catch (e) {
            Logger.error(`Failed to backup binding "${binding.id}":`, e);
            return false;
        }
    }

    _silenceBinding(binding) {
        const targetSettings = this._getSchema(binding.schema);
        if (!targetSettings) return false;

        try {
            switch (binding.type) {
                case BINDING_TYPES.STRING:
                    targetSettings.set_string(binding.key, binding.silencedValue);
                    break;
                case BINDING_TYPES.ARRAY:
                    targetSettings.set_strv(binding.key, binding.silencedValue);
                    break;
                case BINDING_TYPES.ARRAY_GROUP:
                    for (const k of binding.keys) {
                        targetSettings.set_strv(k, binding.silencedValue);
                    }
                    break;
                case BINDING_TYPES.APP_SHORTCUTS:
                    for (let i = 1; i <= binding.count; i++) {
                        for (const prefix of binding.keyPrefixes) {
                            targetSettings.set_strv(`${prefix}${i}`, binding.silencedValue);
                        }
                    }
                    break;
                case BINDING_TYPES.BOOLEAN:
                    targetSettings.set_boolean(binding.key, binding.silencedValue);
                    break;
            }
            return true;
        } catch (e) {
            Logger.error(`Failed to silence binding "${binding.id}":`, e);
            return false;
        }
    }

    _restoreBinding(binding, activeBackups = null) {
        const targetSettings = this._getSchema(binding.schema);
        if (!targetSettings) return false;

        try {
            const backupRecord = activeBackups ? activeBackups[binding.id] : null;

            switch (binding.type) {
                case BINDING_TYPES.STRING: {
                    let val = null;
                    if (backupRecord && typeof backupRecord.data === 'string') {
                        val = backupRecord.data;
                    } else {
                        val = this._ghostSettings.get_string(binding.backupKey);
                    }
                    if (val !== null) {
                        targetSettings.set_string(binding.key, val);
                    }
                    this._ghostSettings.reset(binding.backupKey);
                    break;
                }
                case BINDING_TYPES.ARRAY: {
                    let val = null;
                    if (backupRecord && Array.isArray(backupRecord.data)) {
                        val = backupRecord.data;
                    } else {
                        val = safeJsonParse(this._ghostSettings.get_string(binding.backupKey), null);
                    }
                    if (Array.isArray(val)) {
                        targetSettings.set_strv(binding.key, val);
                    }
                    this._ghostSettings.reset(binding.backupKey);
                    break;
                }
                case BINDING_TYPES.ARRAY_GROUP: {
                    let val = null;
                    if (backupRecord && typeof backupRecord.data === 'object' && backupRecord.data !== null) {
                        val = backupRecord.data;
                    } else {
                        val = safeJsonParse(this._ghostSettings.get_string(binding.backupKey), null);
                    }
                    if (Array.isArray(val)) {
                        targetSettings.set_strv(binding.keys[0], val);
                    } else if (val && typeof val === 'object') {
                        for (const [k, v] of Object.entries(val)) {
                            if (Array.isArray(v)) {
                                targetSettings.set_strv(k, v);
                            }
                        }
                    }
                    this._ghostSettings.reset(binding.backupKey);
                    break;
                }
                case BINDING_TYPES.APP_SHORTCUTS: {
                    let val = null;
                    if (backupRecord && typeof backupRecord.data === 'object' && backupRecord.data !== null) {
                        val = backupRecord.data;
                    } else {
                        val = safeJsonParse(this._ghostSettings.get_string(binding.backupKey), null);
                    }
                    if (val && typeof val === 'object') {
                        for (const [k, v] of Object.entries(val)) {
                            if (Array.isArray(v)) {
                                targetSettings.set_strv(k, v);
                            }
                        }
                    }
                    this._ghostSettings.reset(binding.backupKey);
                    break;
                }
                case BINDING_TYPES.BOOLEAN: {
                    let val = null;
                    if (backupRecord && typeof backupRecord.data === 'boolean') {
                        val = backupRecord.data;
                    } else {
                        val = this._ghostSettings.get_boolean(binding.backupKey);
                    }
                    if (typeof val === 'boolean') {
                        targetSettings.set_boolean(binding.key, val);
                    }
                    this._ghostSettings.reset(binding.backupKey);
                    break;
                }
            }

            if (activeBackups && activeBackups[binding.id]) {
                delete activeBackups[binding.id];
            }
            return true;
        } catch (e) {
            Logger.error(`Failed to restore binding "${binding.id}":`, e);
            return false;
        }
    }

    enableGhostMode() {
        if (this.isGhostModeActive) return;
        Logger.info('Enabling Ghost Mode...');

        const activeBackups = {};
        for (const binding of KEYBINDINGS) {
            if (this._ghostSettings.get_boolean(binding.id)) {
                this._backupBinding(binding, activeBackups);
                this._silenceBinding(binding);
            }
        }

        this._saveActiveBackups(activeBackups);
        this._ghostSettings.set_boolean(SETTINGS_KEYS.GHOST_MODE_ENABLED, true);
        Logger.info('Ghost Mode enabled.');
    }

    disableGhostMode() {
        if (!this.isGhostModeActive) return;
        Logger.info('Disabling Ghost Mode...');

        const activeBackups = this._getActiveBackups();
        for (const binding of KEYBINDINGS) {
            if (activeBackups[binding.id] || this._ghostSettings.get_boolean(binding.id)) {
                this._restoreBinding(binding, activeBackups);
            }
        }

        this._ghostSettings.reset('original-keybindings-backup');
        this._ghostSettings.set_boolean(SETTINGS_KEYS.GHOST_MODE_ENABLED, false);
        Logger.info('Ghost Mode disabled; keys restored.');
    }

    recoverFromCrashIfNeeded() {
        const wasActive = this._ghostSettings.get_boolean(SETTINGS_KEYS.GHOST_MODE_ENABLED);
        const activeBackups = this._getActiveBackups();
        const hasBackups = Object.keys(activeBackups).length > 0;

        if (wasActive || hasBackups) {
            Logger.warn('Interrupted session / crash detected on startup; recovering keybindings...');
            for (const binding of KEYBINDINGS) {
                this._restoreBinding(binding, activeBackups);
            }
            this._ghostSettings.reset('original-keybindings-backup');
            this._ghostSettings.set_boolean(SETTINGS_KEYS.GHOST_MODE_ENABLED, false);
            Logger.info('Keybindings recovered successfully.');
        }
    }

    destroy() {
        if (this._changedSignalId && this._ghostSettings) {
            this._ghostSettings.disconnect(this._changedSignalId);
            this._changedSignalId = null;
        }
        this._schemas = {};
        this._ghostSettings = null;
    }
}
