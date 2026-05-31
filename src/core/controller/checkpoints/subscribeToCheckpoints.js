import { CheckpointEvent_OperationType } from "@shared/proto/cline/checkpoints";
import { Logger } from "@/shared/services/Logger";
import { getRequestRegistry } from "../grpc-handler";
/**
 * Track active checkpoint subscriptions per workspace.
 * Map structure: cwdHash -> Set of response streams
 */
const activeCheckpointSubscriptions = new Map();
/**
 * Subscribe to checkpoint events for a specific workspace.
 *
 * Clients receive real-time notifications about checkpoint operations:
 * - Shadow git initialization
 * - Commit creation
 * - Checkpoint restoration
 *
 * Each operation generates two events (start and completion).
 *
 * @param controller The controller instance
 * @param request The subscription request containing cwdHash
 * @param responseStream The streaming response handler
 * @param requestId The ID of the request
 */
export async function subscribeToCheckpoints(_controller, request, responseStream, requestId) {
    const { cwdHash } = request;
    if (!activeCheckpointSubscriptions.has(cwdHash)) {
        activeCheckpointSubscriptions.set(cwdHash, new Set());
    }
    const subscriptions = activeCheckpointSubscriptions.get(cwdHash);
    if (!subscriptions) {
        throw new Error(`Failed to retrieve subscriptions for cwdHash: ${cwdHash}`);
    }
    subscriptions.add(responseStream);
    // Register cleanup when the connection is closed
    const cleanup = () => {
        subscriptions.delete(responseStream);
        if (subscriptions.size === 0) {
            activeCheckpointSubscriptions.delete(cwdHash);
        }
    };
    if (requestId) {
        getRequestRegistry().registerRequest(requestId, cleanup, { type: "checkpoint_subscription", cwdHash }, responseStream);
    }
}
/**
 * Send a checkpoint event to all subscribers of the specified workspace.
 *
 * @param eventData The checkpoint event to send
 */
export async function sendCheckpointEvent(eventData) {
    const { cwdHash } = eventData;
    const subscriptions = activeCheckpointSubscriptions.get(cwdHash);
    if (!subscriptions || subscriptions.size === 0) {
        return;
    }
    const now = new Date();
    const timestamp = {
        seconds: Math.trunc(now.getTime() / 1_000),
        nanos: (now.getTime() % 1_000) * 1_000_000,
    };
    const event = {
        operation: CheckpointEvent_OperationType[eventData.operation],
        cwdHash: eventData.cwdHash,
        isActive: eventData.isActive,
        timestamp,
        taskId: eventData.taskId,
        commitHash: eventData.commitHash,
    };
    // Send the event to all active subscribers for this workspace
    const promises = Array.from(subscriptions).map(async (responseStream) => {
        try {
            await responseStream(event, false); // Not the last message
        }
        catch (error) {
            Logger.error("Error sending checkpoint event:", error);
            subscriptions.delete(responseStream);
            if (subscriptions.size === 0) {
                activeCheckpointSubscriptions.delete(cwdHash);
            }
        }
    });
    await Promise.all(promises);
}
//# sourceMappingURL=subscribeToCheckpoints.js.map