import { findLastIndex } from "@shared/array";
import { Logger } from "@/shared/services/Logger";
/**
 * Custom error class for hook cancellation
 * Used to signal that a hook cancelled an operation
 */
export class HookCancellationError extends Error {
    wasCancelled;
    constructor(wasCancelled) {
        super("Hook cancelled the operation");
        this.name = "HookCancellationError";
        this.wasCancelled = wasCancelled;
    }
}
/**
 * Extract token usage from an API request message
 * @param message The API request message to parse
 * @returns Token usage information, or zeros if parsing fails
 */
export function extractTokenUsageFromMessage(message) {
    const defaultUsage = {
        tokensIn: 0,
        tokensOut: 0,
        tokensInCache: 0,
        tokensOutCache: 0,
    };
    if (!message?.text) {
        return defaultUsage;
    }
    try {
        const apiReqInfo = JSON.parse(message.text);
        return {
            tokensIn: apiReqInfo.tokensIn || 0,
            tokensOut: apiReqInfo.tokensOut || 0,
            tokensInCache: apiReqInfo.cacheWrites || 0,
            tokensOutCache: apiReqInfo.cacheReads || 0,
        };
    }
    catch (error) {
        Logger.error("[PreCompact] Failed to parse API request token usage:", error);
        return defaultUsage;
    }
}
/**
 * Write context files for PreCompact hook access
 * @param taskId Task identifier
 * @param currentContext Current conversation context
 * @returns Paths to written files and timestamp
 */
export async function writePreCompactContextFiles(taskId, currentContext) {
    const { writeConversationHistoryJson, writeConversationHistoryText } = await import("../storage/disk");
    // Generate single timestamp for both files to ensure they match
    const hookTimestamp = Date.now();
    // Write context files for hook access
    const contextJsonPath = await writeConversationHistoryJson(taskId, currentContext, hookTimestamp);
    const contextRawPath = await writeConversationHistoryText(taskId, currentContext, hookTimestamp);
    return { contextJsonPath, contextRawPath, hookTimestamp };
}
/**
 * Executes the PreCompact hook with proper cleanup and error handling.
 * This shared function eliminates duplication between Task.executePreCompactHook
 * and SummarizeTaskHandler.execute.
 *
 * @param params - Configuration for executing the hook
 * @returns Result containing any context modification provided by the hook
 * @throws HookCancellationError if the hook cancels the operation
 * @throws Re-throws other errors after cleanup (caller should handle gracefully)
 */
export async function executePreCompactHookWithCleanup(params) {
    const { executeHook } = await import("./hook-executor");
    const { cleanupConversationHistoryFile } = await import("../storage/disk");
    let contextJsonPath;
    let contextRawPath;
    try {
        // Get current active context (respects previous compactions)
        const currentContext = params.contextManager.getTruncatedMessages(params.apiConversationHistory, params.conversationHistoryDeletedRange);
        // Write context files for hook access
        const contextFiles = await writePreCompactContextFiles(params.taskId, currentContext);
        contextJsonPath = contextFiles.contextJsonPath;
        contextRawPath = contextFiles.contextRawPath;
        // Extract token usage from the most recent API request
        const previousApiReqIndex = findLastIndex(params.clineMessages, (m) => m.say === "api_req_started");
        const previousRequest = previousApiReqIndex !== -1 ? params.clineMessages[previousApiReqIndex] : undefined;
        const { tokensIn, tokensOut, tokensInCache, tokensOutCache } = extractTokenUsageFromMessage(previousRequest);
        // Extract truncation range - use provided range or extract from conversationHistoryDeletedRange
        let deletedRangeStart = 0;
        let deletedRangeEnd = 0;
        if (params.deletedRange) {
            ;
            [deletedRangeStart, deletedRangeEnd] = params.deletedRange;
        }
        else if (params.conversationHistoryDeletedRange) {
            ;
            [deletedRangeStart, deletedRangeEnd] = params.conversationHistoryDeletedRange;
        }
        // Execute the hook
        const preCompactResult = await executeHook({
            hookName: "PreCompact",
            hookInput: {
                preCompact: {
                    taskId: params.taskId,
                    ulid: params.ulid,
                    contextSize: currentContext.length,
                    compactionStrategy: params.compactionStrategy,
                    previousApiReqIndex: previousApiReqIndex,
                    tokensIn,
                    tokensOut,
                    tokensInCache,
                    tokensOutCache,
                    deletedRangeStart,
                    deletedRangeEnd,
                    contextJsonPath: contextJsonPath,
                    contextRawPath: contextRawPath,
                },
            },
            isCancellable: true,
            say: params.say,
            setActiveHookExecution: params.setActiveHookExecution,
            clearActiveHookExecution: params.clearActiveHookExecution,
            messageStateHandler: params.messageStateHandler,
            taskId: params.taskId,
            hooksEnabled: params.hooksEnabled,
            model: params.modelContext,
        });
        // Handle cancellation from hook
        if (preCompactResult.cancel === true) {
            // Log cancellation for debugging
            const cancellationSource = preCompactResult.wasCancelled ? "user" : "PreCompact hook";
            Logger.log(`[PreCompact] Context compaction cancelled by ${cancellationSource} for task ${params.taskId}`);
            // Internalized cancellation state management (replaces handleCancellation callback)
            // Always save state before cancelling, regardless of cancellation source
            params.taskState.didFinishAbortingStream = true;
            await params.messageStateHandler.saveClineMessagesAndUpdateHistory();
            await params.messageStateHandler.overwriteApiConversationHistory(params.messageStateHandler.getApiConversationHistory());
            await params.postStateToWebview();
            // Trigger full cancellation flow
            await params.cancelTask();
            // Throw error to signal cancellation to caller
            throw new HookCancellationError(preCompactResult.wasCancelled);
        }
        // Hook completed successfully - log if context modification provided
        if (preCompactResult.contextModification) {
            Logger.log(`[PreCompact] Hook provided context modification for task ${params.taskId}`);
        }
        return {
            contextModification: preCompactResult.contextModification,
        };
    }
    catch (error) {
        // Re-throw error for caller to handle
        throw error;
    }
    finally {
        // Clean up temporary files - always executed regardless of success or error
        // Wrap in try-catch to prevent cleanup failures from masking original errors
        try {
            if (contextJsonPath) {
                await cleanupConversationHistoryFile(contextJsonPath);
            }
            if (contextRawPath) {
                await cleanupConversationHistoryFile(contextRawPath);
            }
        }
        catch (cleanupError) {
            Logger.error("[PreCompact] Failed to cleanup context files:", cleanupError);
            // Don't throw - cleanup failure shouldn't mask original error
        }
    }
}
//# sourceMappingURL=precompact-executor.js.map