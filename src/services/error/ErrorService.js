import { Logger } from "@/shared/services/Logger";
import { ClineError } from "./ClineError";
import { ErrorProviderFactory } from "./ErrorProviderFactory";
/**
 * ErrorService handles error logging and tracking for the Cline extension
 * Uses an abstracted error provider to support multiple error tracking backends
 * Respects user privacy settings and VSCode's global telemetry configuration
 */
export class ErrorService {
    static instance = null;
    provider;
    /**
     * Sets up the ErrorService singleton.
     */
    static async initialize() {
        if (ErrorService.instance) {
            throw new Error("ErrorService has already been initialized.");
        }
        const provider = await ErrorProviderFactory.createProvider(ErrorProviderFactory.getDefaultConfig());
        ErrorService.instance = new ErrorService(provider);
        return ErrorService.instance;
    }
    /**
     * Gets the singleton instance
     */
    static get() {
        if (!ErrorService.instance) {
            throw new Error("ErrorService not setup. Call ErrorService.initialize() first.");
        }
        return ErrorService.instance;
    }
    constructor(provider) {
        this.provider = provider;
    }
    captureException(error, properties) {
        return this.provider.captureException(error, properties);
    }
    logException(error, properties) {
        this.provider.logException(error, properties);
        Logger.error("[ErrorService] Logging exception", JSON.stringify(error));
    }
    logMessage(message, level = "log", properties) {
        this.provider.logMessage(message, level, properties);
    }
    toClineError(rawError, modelId, providerId) {
        const transformed = ClineError.transform(rawError, modelId, providerId);
        this.logException(transformed, { modelId, providerId });
        return transformed;
    }
    /**
     * Check if error logging is currently enabled
     * @returns Boolean indicating whether error logging is enabled
     */
    isEnabled() {
        return this.provider.isEnabled();
    }
    /**
     * Get current error logging settings
     * @returns Current error logging settings
     */
    getSettings() {
        return this.provider.getSettings();
    }
    /**
     * Get the error provider instance
     * @returns The current error provider
     */
    getProvider() {
        return this.provider;
    }
    /**
     * Clean up resources when the service is disposed
     */
    async dispose() {
        await this.provider.dispose();
    }
}
//# sourceMappingURL=ErrorService.js.map