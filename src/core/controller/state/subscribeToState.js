import { telemetryService } from "@/services/telemetry";
import { Logger } from "@/shared/services/Logger";
import { getRequestRegistry } from "../grpc-handler";
// Keep track of active state subscriptions
const activeStateSubscriptions = new Set();
/**
 * Subscribe to state updates
 * @param controller The controller instance
 * @param request The empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToState(controller, _request, responseStream, requestId) {
    // Add this subscription to the active subscriptions
    activeStateSubscriptions.add(responseStream);
    // Register cleanup when the connection is closed
    const cleanup = () => {
        activeStateSubscriptions.delete(responseStream);
    };
    // Register the cleanup function with the request registry if we have a requestId
    if (requestId) {
        getRequestRegistry().registerRequest(requestId, cleanup, { type: "state_subscription" }, responseStream);
    }
    // Send the initial state
    const initialState = await controller.getStateToPostToWebview();
    const initialStateJson = JSON.stringify(initialState);
    recordStateSizeTelemetry(Buffer.byteLength(initialStateJson, "utf8"));
    try {
        await responseStream({
            stateJson: initialStateJson,
        }, false);
    }
    catch (error) {
        Logger.error("Error sending initial state:", error);
        activeStateSubscriptions.delete(responseStream);
    }
}
/**
 * Send a state update to all active subscribers
 * @param state The state to send
 */
export async function sendStateUpdate(state) {
    let stateJson;
    try {
        stateJson = JSON.stringify(state);
    }
    catch (error) {
        Logger.error("Error serializing state update:", error);
        return;
    }
    recordStateSizeTelemetry(Buffer.byteLength(stateJson, "utf8"));
    const promises = Array.from(activeStateSubscriptions).map(async (responseStream) => {
        try {
            await responseStream({
                stateJson,
            }, false);
        }
        catch (error) {
            Logger.error("Error sending state update:", error);
            activeStateSubscriptions.delete(responseStream);
        }
    });
    await Promise.all(promises);
}
function recordStateSizeTelemetry(sizeBytes) {
    telemetryService.captureGrpcResponseSize(sizeBytes, "cline.StateService", "subscribeToState");
}
//# sourceMappingURL=subscribeToState.js.map