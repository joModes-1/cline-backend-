import { Empty } from "@shared/proto/cline/common";
import { Logger } from "@/shared/services/Logger";
/**
 * Flush all pending state changes immediately to disk
 * Bypasses the debounced persistence and forces immediate writes
 */
export async function flushPendingState(controller, request) {
    try {
        await controller.stateManager.flushPendingState();
        return Empty.create({});
    }
    catch (error) {
        Logger.error("[flushPendingState] Error flushing pending state:", error);
        throw error;
    }
}
//# sourceMappingURL=flushPendingState.js.map