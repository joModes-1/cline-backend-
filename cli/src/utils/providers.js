/**
 * Shared provider metadata utilities
 * Used by both UI components and CLI commands
 */
import { useMemo } from "react";
import { StateManager } from "@/core/storage/StateManager";
import providersData from "@/shared/providers/providers.json";
// Create a lookup map from provider value to display label
const providerLabels = Object.fromEntries(providersData.list.map((p) => [p.value, p.label]));
// Get provider order from providers.json (same order as webview)
const providerOrder = providersData.list.map((p) => p.value);
/**
 * Providers that are not supported in CLI.
 * - vscode-lm: Requires VS Code's Language Model API (see ENG-1490 for OAuth-based support)
 */
const CLI_EXCLUDED_PROVIDERS = new Set(["vscode-lm"]);
/**
 * Get the display label for a provider ID
 */
export function getProviderLabel(providerId) {
    return providerLabels[providerId] || providerId;
}
/**
 * Get the ordered list of all provider IDs (from providers.json)
 */
function getProviderOrder() {
    return providerOrder;
}
/**
 * Get the list of valid CLI provider IDs (excluding unsupported providers)
 */
export function getValidCliProviders() {
    return providerOrder.filter((p) => !CLI_EXCLUDED_PROVIDERS.has(p));
}
/**
 * Check if a provider ID is valid for CLI use
 */
export function isValidCliProvider(providerId) {
    return providerOrder.includes(providerId) && !CLI_EXCLUDED_PROVIDERS.has(providerId);
}
const getValidProviders = (remoteConfig) => {
    if (remoteConfig?.remoteConfiguredProviders?.length) {
        return remoteConfig.remoteConfiguredProviders;
    }
    return getProviderOrder().filter((p) => !CLI_EXCLUDED_PROVIDERS.has(p));
};
export const useValidProviders = () => {
    const remoteConfig = StateManager.get().getRemoteConfigSettings();
    return useMemo(() => {
        return getValidProviders(remoteConfig);
    }, [remoteConfig]);
};
//# sourceMappingURL=providers.js.map