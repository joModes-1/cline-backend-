import { TASK_CALLBACKS_KEYS, TASK_CONFIG_KEYS, TASK_SERVICES_KEYS } from "../utils/ToolConstants";
/**
 * Runtime validation function to ensure config has all required properties
 * Automatically derives expected keys from the interface definitions
 */
export function validateTaskConfig(config) {
    if (!config) {
        throw new Error("TaskConfig is null or undefined");
    }
    // Validate all expected keys exist
    for (const key of TASK_CONFIG_KEYS) {
        if (!(key in config)) {
            throw new Error(`Missing ${key} in TaskConfig`);
        }
    }
    // Special validation for boolean type
    if (typeof config.strictPlanModeEnabled !== "boolean") {
        throw new Error("strictPlanModeEnabled must be a boolean in TaskConfig");
    }
    // Validate services object
    if (config.services) {
        for (const key of TASK_SERVICES_KEYS) {
            if (!(key in config.services)) {
                throw new Error(`Missing services.${key} in TaskConfig`);
            }
        }
    }
    // Validate callbacks object
    if (config.callbacks) {
        for (const key of TASK_CALLBACKS_KEYS) {
            if (typeof config.callbacks[key] !== "function") {
                throw new Error(`Missing or invalid callbacks.${key} in TaskConfig (must be a function)`);
            }
        }
    }
}
//# sourceMappingURL=TaskConfig.js.map