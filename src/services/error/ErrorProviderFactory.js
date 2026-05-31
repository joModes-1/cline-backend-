import { ClineEndpoint } from "@/config";
import { isPostHogConfigValid, posthogConfig } from "@/shared/services/config/posthog-config";
import { Logger } from "@/shared/services/Logger";
import { PostHogErrorProvider } from "./providers/PostHogErrorProvider";
/**
 * Factory class for creating error providers
 * Allows easy switching between different error tracking providers
 */
export class ErrorProviderFactory {
    /**
     * Creates an error provider based on the provided configuration
     * @param config Configuration for the error provider
     * @returns IErrorProvider instance
     */
    static async createProvider(config) {
        switch (config.type) {
            case "posthog": {
                const hasValidPostHogConfig = isPostHogConfigValid(config.config);
                const errorTrackingApiKey = config.config.errorTrackingApiKey;
                return hasValidPostHogConfig && errorTrackingApiKey
                    ? await new PostHogErrorProvider({
                        apiKey: errorTrackingApiKey,
                        errorTrackingApiKey: errorTrackingApiKey,
                        host: config.config.host,
                        uiHost: config.config.uiHost,
                        enableExceptionAutocapture: !!config.config.enableErrorAutocapture,
                    }).initialize()
                    : new NoOpErrorProvider(); // Fallback to no-op provider
            }
            default:
                return new NoOpErrorProvider();
        }
    }
    /**
     * Gets the default error provider configuration
     * @returns Default configuration using PostHog, or no-op for self-hosted mode
     */
    static getDefaultConfig() {
        // Use no-op provider in self-hosted mode to avoid external network calls
        if (ClineEndpoint.isSelfHosted()) {
            return {
                type: "no-op",
                config: posthogConfig,
            };
        }
        return {
            type: "posthog",
            config: posthogConfig,
        };
    }
}
/**
 * No-operation error provider for when error logging is disabled
 * or for testing purposes
 */
class NoOpErrorProvider {
    async captureException(error, properties) {
        Logger.error("[NoOpErrorProvider] captureException called", { error: error.message || String(error), properties });
    }
    logException(error, _properties) {
        // Use Logger.error directly to avoid potential infinite recursion through Logger
        Logger.error("[NoOpErrorProvider]", error.message || String(error));
    }
    logMessage(message, level, properties) {
        Logger.log("[NoOpErrorProvider]", { message, level, properties });
    }
    isEnabled() {
        return true;
    }
    getSettings() {
        return {
            enabled: true,
            hostEnabled: true,
            level: "all",
        };
    }
    async dispose() {
        Logger.info("[NoOpErrorProvider] Disposing");
    }
}
//# sourceMappingURL=ErrorProviderFactory.js.map