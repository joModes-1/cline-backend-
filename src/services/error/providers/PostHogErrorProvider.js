import { PostHog } from "posthog-node";
import { StateManager } from "@/core/storage/StateManager";
import { HostProvider } from "@/hosts/host-provider";
import { getDistinctId } from "@/services/logging/distinctId";
import { PostHogClientProvider } from "@/services/telemetry/providers/posthog/PostHogClientProvider";
import { fetch } from "@/shared/net";
import { Setting } from "@/shared/proto/index.host";
import { Logger } from "@/shared/services/Logger";
import * as pkg from "../../../../package.json";
import { getErrorLevelFromString } from "..";
import { ClineError } from "../ClineError";
const isDev = process.env.IS_DEV === "true";
/**
 * PostHog implementation of the error provider interface
 * Handles PostHog-specific error tracking and logging
 */
export class PostHogErrorProvider {
    client;
    errorSettings;
    // Does not accept shared client
    isSharedClient = false;
    constructor(clientConfig) {
        this.client = new PostHog(clientConfig.errorTrackingApiKey, {
            host: clientConfig.host,
            fetch: (url, options) => fetch(url, options),
            enableExceptionAutocapture: clientConfig.enableExceptionAutocapture,
            before_send: (event) => PostHogClientProvider.eventFilter(event),
        });
        // Initialize error settings
        this.errorSettings = {
            enabled: true,
            hostEnabled: true,
            level: "all",
        };
    }
    async initialize() {
        // Listen for host telemetry changes
        HostProvider.env.subscribeToTelemetrySettings({}, {
            onResponse: (event) => {
                const hostEnabled = event.isEnabled === Setting.ENABLED || event.isEnabled === Setting.UNSUPPORTED;
                this.errorSettings.hostEnabled = hostEnabled;
            },
        });
        const hostSettings = await HostProvider.env.getTelemetrySettings({});
        if (hostSettings.isEnabled === Setting.DISABLED) {
            this.errorSettings.hostEnabled = false;
        }
        this.errorSettings.level = getErrorLevelFromString(hostSettings.errorLevel);
        return this;
    }
    captureException(error, properties) {
        if (!this.isEnabled() || this.errorSettings.level === "off") {
            return Promise.resolve();
        }
        const errorDetails = {
            name: error.name,
            extension_version: pkg.version,
            is_dev: isDev,
            ...properties,
        };
        return this.client.captureExceptionImmediate(error, this.distinctId, errorDetails);
    }
    logException(error, properties = {}) {
        if (!this.isEnabled() || this.errorSettings.level === "off") {
            return;
        }
        const errorDetails = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            extension_version: pkg.version,
            is_dev: isDev,
            ...properties,
        };
        if (error instanceof ClineError) {
            Object.assign(errorDetails, {
                modelId: error.modelId,
                providerId: error.providerId,
                serialized_error: error.serialize(),
            });
        }
        this.client.capture({
            distinctId: this.distinctId,
            event: "extension.error",
            properties: {
                error_type: "exception",
                ...errorDetails,
                timestamp: new Date().toISOString(),
            },
        });
        Logger.error("[PostHogErrorProvider] Logging exception", error);
    }
    logMessage(message, level = "log", properties = {}) {
        if (!this.isEnabled() || this.errorSettings.level === "off") {
            return;
        }
        // Filter messages based on error level
        if (this.errorSettings.level === "error" && level !== "error") {
            return;
        }
        this.client.capture({
            distinctId: this.distinctId,
            event: "extension.message",
            properties: {
                message: message.substring(0, 500), // Truncate long messages
                level,
                extension_version: pkg.version,
                is_dev: isDev,
                timestamp: new Date().toISOString(),
                ...properties,
            },
        });
    }
    isEnabled() {
        return StateManager.get().getGlobalSettingsKey("telemetrySetting") !== "disabled" && this.errorSettings.hostEnabled;
    }
    getSettings() {
        return { ...this.errorSettings };
    }
    get distinctId() {
        return getDistinctId();
    }
    async dispose() {
        // Only shut down the client if it's not shared (we own it)
        if (!this.isSharedClient) {
            await this.client.shutdown().catch((error) => Logger.error("Error shutting down PostHog client:", error));
        }
    }
}
//# sourceMappingURL=PostHogErrorProvider.js.map