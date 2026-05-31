import { openFile as openFileIntegration } from "@integrations/misc/open-file";
import { Empty } from "@shared/proto/cline/common";
import path from "path";
import { HostProvider } from "@/hosts/host-provider";
/**
 * Opens a file in the editor
 * @param controller The controller instance
 * @param request The request message containing the file path in the 'value' field
 * @returns Empty response
 */
export async function openDiskConversationHistory(_controller, request) {
    const globalStoragePath = HostProvider.get().globalStorageFsPath;
    const taskConversationHistoryPath = path.join(globalStoragePath, "tasks", request.value, "api_conversation_history.json");
    if (request.value) {
        openFileIntegration(taskConversationHistoryPath);
    }
    return Empty.create();
}
//# sourceMappingURL=openDiskConversationHistory.js.map