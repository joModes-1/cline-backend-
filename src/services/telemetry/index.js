export { PostHogTelemetryProvider } from "./providers/posthog/PostHogTelemetryProvider";
export { TelemetryProviderFactory, } from "./TelemetryProviderFactory";
// Export the enums and types for terminal telemetry
export { TerminalHangStage, TerminalOutputFailureReason, TerminalUserInterventionAction, } from "./TelemetryService";
// Create a singleton instance for easy access throughout the application
import { TelemetryService } from "./TelemetryService";
let _telemetryServiceInstance = null;
let _initializationPromise = null;
/**
 * Get the singleton telemetry service instance
 * @param distinctId Optional distinct ID for the telemetry provider
 * @returns TelemetryService instance
 */
export async function getTelemetryService() {
    if (_telemetryServiceInstance) {
        return _telemetryServiceInstance;
    }
    // If initialization is already in progress, wait for it to complete
    if (_initializationPromise) {
        return _initializationPromise;
    }
    // Start initialization and store the promise to prevent concurrent initialization.
    // Ensure that on failure we reset the initialization promise so future calls can retry.
    _initializationPromise = TelemetryService.create()
        .then((service) => {
        _telemetryServiceInstance = service;
        _initializationPromise = null;
        return service;
    })
        .catch((error) => {
        _initializationPromise = null;
        throw error;
    });
    return _initializationPromise;
}
/**
 * Reset the telemetry service instance (useful for testing)
 */
export function resetTelemetryService() {
    _telemetryServiceInstance = null;
    _initializationPromise = null;
}
export const telemetryService = new Proxy({}, {
    get(_target, prop, _receiver) {
        // Return a function that will call the method on the actual service
        return async (...args) => {
            const service = await getTelemetryService();
            const method = Reflect.get(service, prop, service);
            if (typeof method === "function") {
                return method.apply(service, args);
            }
            return method;
        };
    },
});
//# sourceMappingURL=index.js.map