import { execSync } from "child_process";
import { showApprovalNotification } from "@/integrations/notifications";
import { calculateApiCostAnthropic } from "@/utils/cost";
export const showNotificationForApproval = (message, notificationsEnabled) => {
    void showApprovalNotification({ message }, notificationsEnabled);
};
// update api_req_started. we can't use api_req_finished anymore since it's a unique case where it could come after a streaming message (ie in the middle of being updated or executed)
// fortunately api_req_finished was always parsed out for the gui anyways, so it remains solely for legacy purposes to keep track of prices in tasks from history
// (it's worth removing a few months from now)
export const updateApiReqMsg = async (params) => {
    const clineMessages = params.messageStateHandler.getClineMessages();
    const currentApiReqInfo = JSON.parse(clineMessages[params.lastApiReqIndex].text || "{}");
    delete currentApiReqInfo.retryStatus; // Clear retry status when request is finalized
    await params.messageStateHandler.updateClineMessage(params.lastApiReqIndex, {
        text: JSON.stringify({
            ...currentApiReqInfo, // Spread the modified info (with retryStatus removed)
            tokensIn: params.inputTokens,
            tokensOut: params.outputTokens,
            cacheWrites: params.cacheWriteTokens,
            cacheReads: params.cacheReadTokens,
            cost: params.totalCost ??
                calculateApiCostAnthropic(params.api.getModel().info, params.inputTokens, params.outputTokens, params.cacheWriteTokens, params.cacheReadTokens),
            cancelReason: params.cancelReason,
            streamingFailedMessage: params.streamingFailedMessage,
        }),
    });
};
/**
 * Common CLI tools that developers frequently use
 */
const CLI_TOOLS = [
    "gh",
    "git",
    "docker",
    "podman",
    "kubectl",
    "aws",
    "gcloud",
    "az",
    "terraform",
    "pulumi",
    "npm",
    "yarn",
    "pnpm",
    "pip",
    "cargo",
    "go",
    "curl",
    "jq",
    "make",
    "cmake",
    "python",
    "node",
    "psql",
    "mysql",
    "redis-cli",
    "sqlite3",
    "mongosh",
    "code",
    "grep",
    "sed",
    "awk",
    "brew",
    "apt",
    "yum",
    "gradle",
    "mvn",
    "bundle",
    "dotnet",
    "helm",
    "ansible",
    "wget",
];
/**
 * Detect which CLI tools are available in the system PATH
 * Uses 'which' command on Unix-like systems and 'where' on Windows
 */
export async function detectAvailableCliTools() {
    const availableCommands = [];
    const isWindows = process.platform === "win32";
    const checkCommand = isWindows ? "where" : "which";
    for (const command of CLI_TOOLS) {
        try {
            // Use execSync to check if the command exists
            execSync(`${checkCommand} ${command}`, {
                stdio: "ignore", // Don't output to console
                timeout: 1000, // 1 second timeout to avoid hanging
            });
            availableCommands.push(command);
        }
        catch (error) {
            // Command not found, skip it
        }
    }
    return availableCommands;
}
/**
 * Extracts the domain from a provider URL string
 * @param url The URL to extract domain from
 * @returns The domain/hostname or undefined if invalid
 */
export function extractProviderDomainFromUrl(url) {
    if (!url) {
        return undefined;
    }
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=utils.js.map