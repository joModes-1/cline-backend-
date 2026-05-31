/**
 * Determines if multi-root workspace mode should be enabled.
 *
 * Multi-root is enabled when the user has opted in via their settings.
 *
 * @param stateManager - The state manager to check user preferences
 * @returns true if user setting is enabled
 */
export function isMultiRootEnabled(stateManager) {
    const userSetting = stateManager.getGlobalStateKey("multiRootEnabled");
    return !!userSetting;
}
//# sourceMappingURL=multi-root-utils.js.map