import { telemetryService } from "@/services/telemetry";
import { showNotificationForApproval } from "../../utils";
import { removeClosingTag } from "../utils/ToolConstants";
/**
 * Creates strongly-typed UI helpers from a TaskConfig
 */
export function createUIHelpers(config) {
    return {
        say: config.callbacks.say,
        ask: config.callbacks.ask,
        removeClosingTag: (block, tag, text) => removeClosingTag(block, tag, text),
        removeLastPartialMessageIfExistsWithType: config.callbacks.removeLastPartialMessageIfExistsWithType,
        shouldAutoApproveTool: (toolName) => config.autoApprover.shouldAutoApproveTool(toolName),
        shouldAutoApproveToolWithPath: config.callbacks.shouldAutoApproveToolWithPath,
        askApproval: async (messageType, message) => {
            const { response } = await config.callbacks.ask(messageType, message, false);
            return response === "yesButtonClicked";
        },
        captureTelemetry: (toolName, autoApproved, approved, isNativeToolCall) => {
            // Extract provider information for telemetry
            const apiConfig = config.services.stateManager.getApiConfiguration();
            const currentMode = config.services.stateManager.getGlobalSettingsKey("mode");
            const provider = (currentMode === "plan" ? apiConfig.planModeApiProvider : apiConfig.actModeApiProvider);
            telemetryService.captureToolUsage(config.ulid, toolName, config.api.getModel().id, provider, autoApproved, approved, undefined, isNativeToolCall);
        },
        showNotificationIfEnabled: (message) => {
            showNotificationForApproval(message, config.autoApprovalSettings.enableNotifications);
        },
        getConfig: () => config,
    };
}
//# sourceMappingURL=UIHelpers.js.map