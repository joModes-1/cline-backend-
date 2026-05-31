import { Empty } from "@shared/proto/cline/common";
import { Logger } from "@/shared/services/Logger";
import { getRequestRegistry } from "../grpc-handler";
// Keep track of active worktrees button clicked subscriptions
const activeWorktreesButtonClickedSubscriptions = new Set();
/**
 * Subscribe to worktrees button clicked events
 * @param controller The controller instance
 * @param request The empty request
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request (passed by the gRPC handler)
 */
export async function subscribeToWorktreesButtonClicked(_controller, _request, responseStream, requestId) {
    // Add this subscription to the active subscriptions
    activeWorktreesButtonClickedSubscriptions.add(responseStream);
    // Register cleanup when the connection is closed
    const cleanup = () => {
        activeWorktreesButtonClickedSubscriptions.delete(responseStream);
    };
    // Register the cleanup function with the request registry if we have a requestId
    if (requestId) {
        getRequestRegistry().registerRequest(requestId, cleanup, { type: "worktrees_button_clicked_subscription" }, responseStream);
    }
}
/**
 * Send a worktrees button clicked event to all active subscribers
 */
export async function sendWorktreesButtonClickedEvent() {
    // Send the event to all active subscribers
    const promises = Array.from(activeWorktreesButtonClickedSubscriptions).map(async (responseStream) => {
        try {
            const event = Empty.create({});
            await responseStream(event, false);
        }
        catch (error) {
            Logger.error("Error sending worktrees button clicked event:", error);
            // Remove the subscription if there was an error
            activeWorktreesButtonClickedSubscriptions.delete(responseStream);
        }
    });
    await Promise.all(promises);
}
//# sourceMappingURL=subscribeToWorktreesButtonClicked.js.map