/**
 * Ghost Key Extension - Constants and Definitions
 *
 * Defines schemas, keybinding descriptors, and logging helpers.
 */

export const SCHEMAS = {
    MUTTER: 'org.gnome.mutter',
    WM: 'org.gnome.desktop.wm.keybindings',
    SHELL: 'org.gnome.shell.keybindings',
    GHOST_KEY: 'org.gnome.shell.extensions.ghostkey',
};

export const SETTINGS_KEYS = {
    GHOST_MODE_ENABLED: 'ghost-mode-enabled',
    DISABLE_OVERLAY_KEY: 'disable-overlay-key',
    DISABLE_WINDOW_MENU: 'disable-window-menu-shortcut',
    DISABLE_INPUT_SOURCE: 'disable-input-source-shortcut',
    DISABLE_APP_VIEW: 'disable-app-view-shortcut',
    DISABLE_APP_SHORTCUTS: 'disable-app-shortcuts',
};

export const BINDING_TYPES = {
    STRING: 'string',
    ARRAY: 'array',
    ARRAY_GROUP: 'array-group',
    APP_SHORTCUTS: 'app-shortcuts',
    BOOLEAN: 'boolean',
};

export const KEYBINDINGS = [
    {
        id: SETTINGS_KEYS.DISABLE_OVERLAY_KEY,
        label: 'Super Key',
        schema: SCHEMAS.MUTTER,
        key: 'overlay-key',
        backupKey: 'original-overlay-key',
        type: BINDING_TYPES.STRING,
        silencedValue: '',
        optional: false,
    },
    {
        id: SETTINGS_KEYS.DISABLE_WINDOW_MENU,
        label: 'Window Menu',
        schema: SCHEMAS.WM,
        key: 'activate-window-menu',
        backupKey: 'original-window-menu',
        type: BINDING_TYPES.ARRAY,
        silencedValue: [],
        optional: false,
    },
    {
        id: SETTINGS_KEYS.DISABLE_INPUT_SOURCE,
        label: 'Input Source Switch',
        schema: SCHEMAS.WM,
        keys: ['switch-input-source', 'switch-input-source-backward'],
        backupKey: 'original-input-source',
        type: BINDING_TYPES.ARRAY_GROUP,
        silencedValue: [],
        optional: false,
    },
    {
        id: SETTINGS_KEYS.DISABLE_APP_VIEW,
        label: 'Application View',
        schema: SCHEMAS.SHELL,
        key: 'toggle-application-view',
        backupKey: 'original-app-view',
        type: BINDING_TYPES.ARRAY,
        silencedValue: [],
        optional: false,
    },
    {
        id: SETTINGS_KEYS.DISABLE_APP_SHORTCUTS,
        label: 'App Shortcuts (1-9)',
        schema: SCHEMAS.SHELL,
        keyPrefixes: ['open-new-window-application-', 'switch-to-application-'],
        count: 9,
        backupKey: 'original-app-shortcuts',
        type: BINDING_TYPES.APP_SHORTCUTS,
        silencedValue: [],
        optional: false,
    },
];

const LOG_PREFIX = '[GhostKey]';

export const Logger = {
    debug: (...args) => console.debug(LOG_PREFIX, ...args),
    info: (...args) => console.info(LOG_PREFIX, ...args),
    warn: (...args) => console.warn(LOG_PREFIX, ...args),
    error: (...args) => console.error(LOG_PREFIX, ...args),
};
