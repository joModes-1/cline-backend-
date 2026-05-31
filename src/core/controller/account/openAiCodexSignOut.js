import { openAiCodexOAuthManager } from "@/integrations/openai-codex/oauth";
import { Logger } from "@/shared/services/Logger";
/**
 * Signs out of OpenAI Codex by clearing stored credentials
 */
export async function openAiCodexSignOut(controller, _) {
    try {
        // Clear stored credentials
        await openAiCodexOAuthManager.clearCredentials();
        // Cancel any pending authorization flow
        openAiCodexOAuthManager.cancelAuthorizationFlow();
        // Update the state to reflect sign out
        await controller.postStateToWebview();
    }
    catch (error) {
        Logger.error("[openAiCodexSignOut] Failed to sign out:", error);
        throw error;
    }
    return {};
}
//# sourceMappingURL=openAiCodexSignOut.js.map