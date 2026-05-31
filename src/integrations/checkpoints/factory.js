import { isMultiRootEnabled } from "@core/workspace/multi-root-utils";
import { createTaskCheckpointManager } from "@integrations/checkpoints";
import { MultiRootCheckpointManager } from "@integrations/checkpoints/MultiRootCheckpointManager";
/**
 * Simple predicate abstracting our multi-root decision.
 */
export function shouldUseMultiRoot({ workspaceManager, enableCheckpoints, stateManager, multiRootEnabledOverride, }) {
    const multiRootEnabled = multiRootEnabledOverride ?? isMultiRootEnabled(stateManager);
    return Boolean(multiRootEnabled && enableCheckpoints && workspaceManager && workspaceManager.getRoots().length > 1);
}
/**
 * Central factory for creating the appropriate checkpoint manager.
 * - MultiRootCheckpointManager for multi-root tasks
 * - TaskCheckpointManager for single-root tasks
 */
export function buildCheckpointManager(args) {
    const { taskId, messageStateHandler, fileContextTracker, diffViewProvider, taskState, workspaceManager, updateTaskHistory, say, cancelTask, postStateToWebview, initialConversationHistoryDeletedRange, initialCheckpointManagerErrorMessage, stateManager, } = args;
    const enableCheckpoints = stateManager.getGlobalSettingsKey("enableCheckpointsSetting");
    if (shouldUseMultiRoot({ workspaceManager, enableCheckpoints, stateManager })) {
        // Multi-root manager (init should be kicked off externally, non-blocking)
        return new MultiRootCheckpointManager(workspaceManager, taskId, enableCheckpoints, messageStateHandler);
    }
    // Single-root manager
    return createTaskCheckpointManager({ taskId }, { enableCheckpoints }, {
        diffViewProvider,
        messageStateHandler,
        fileContextTracker,
        taskState,
        workspaceManager,
    }, {
        updateTaskHistory,
        say,
        cancelTask,
        postStateToWebview,
    }, {
        conversationHistoryDeletedRange: initialConversationHistoryDeletedRange,
        checkpointManagerErrorMessage: initialCheckpointManagerErrorMessage,
    });
}
//# sourceMappingURL=factory.js.map