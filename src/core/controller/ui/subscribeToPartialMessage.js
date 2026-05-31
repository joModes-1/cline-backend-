import { Logger } from "@/shared/services/Logger";
import { getRequestRegistry } from "../grpc-handler";
// Keep track of active partial message subscriptions (gRPC streams)
const activePartialMessageSubscriptions = new Set();
const callbackSubscriptions = new Set();
/**
 * Subscribe to partial message events
 * @param controller The controller instance
 * @param request The empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToPartialMessage(_controller, _request, responseStream, requestId) {
    // Add this subscription to the active subscriptions
    activePartialMessageSubscriptions.add(responseStream);
    // Register cleanup when the connection is closed
    const cleanup = () => {
        activePartialMessageSubscriptions.delete(responseStream);
    };
    // Register the cleanup function with the request registry if we have a requestId
    if (requestId) {
        getRequestRegistry().registerRequest(requestId, cleanup, { type: "partial_message_subscription" }, responseStream);
    }
}
/**
 * Register a callback to receive partial message events (for CLI and non-gRPC consumers)
 * @param callback The callback function to receive messages
 * @returns A function to unsubscribe
 */
export function registerPartialMessageCallback(callback) {
    callbackSubscriptions.add(callback);
    return () => {
        callbackSubscriptions.delete(callback);
    };
}
/**
 * Send a partial message event to all active subscribers
 * @param partialMessage The ClineMessage to send
 */
export async function sendPartialMessageEvent(partialMessage) {
    // Send to gRPC stream subscribers
    const streamPromises = Array.from(activePartialMessageSubscriptions).map(async (responseStream) => {
        try {
            await responseStream(partialMessage, false);
        }
        catch (error) {
            Logger.error("Error sending partial message event:", error);
            // Remove the subscription if there was an error
            activePartialMessageSubscriptions.delete(responseStream);
        }
    });
    // Send to callback subscribers (synchronous)
    for (const callback of callbackSubscriptions) {
        try {
            callback(partialMessage);
        }
        catch (error) {
            Logger.error("Error in partial message callback:", error);
        }
    }
    await Promise.all(streamPromises);
}
//# sourceMappingURL=subscribeToPartialMessage.js.map