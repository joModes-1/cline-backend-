import { Boolean } from "@shared/proto/cline/common";
import { PlanActMode } from "@shared/proto/cline/state";
import { Logger } from "@/shared/services/Logger";
/**
 * Toggles between Plan and Act modes
 * @param controller The controller instance
 * @param request The request containing the chat settings and optional chat content
 * @returns An empty response
 */
export async function togglePlanActModeProto(controller, request) {
    try {
        let mode;
        if (request.mode === PlanActMode.PLAN) {
            mode = "plan";
        }
        else if (request.mode === PlanActMode.ACT) {
            mode = "act";
        }
        else {
            throw new Error(`Invalid mode value: ${request.mode}`);
        }
        const chatContent = request.chatContent;
        // Call the existing controller implementation
        const sentMessage = await controller.togglePlanActMode(mode, chatContent);
        return Boolean.create({
            value: sentMessage,
        });
    }
    catch (error) {
        Logger.error("Failed to toggle Plan/Act mode:", error);
        throw error;
    }
}
//# sourceMappingURL=togglePlanActModeProto.js.map