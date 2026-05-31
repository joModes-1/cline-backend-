import { DeleteAllTaskHistoryCount } from "@shared/proto/cline/task";
import fs from "fs/promises";
import path from "path";
import { HostProvider } from "@/hosts/host-provider";
import { ShowMessageType } from "@/shared/proto/host/window";
import { Logger } from "@/shared/services/Logger";
import { fileExistsAtPath } from "../../../utils/fs";
/**
 * Deletes all task history, with an option to preserve favorites
 * @param controller The controller instance
 * @param request Request with option to preserve favorites
 * @returns Results with count of deleted tasks
 */
export async function deleteAllTaskHistory(controller) {
    try {
        // Clear current task first
        await controller.clearTask();
        // Get existing task history
        const taskHistory = controller.stateManager.getGlobalStateKey("taskHistory");
        const totalTasks = taskHistory.length;
        // For web version, we don't show modal dialogs - just delete everything
        // Note: The original VSCode version would show a dialog with options to:
        // - Delete All Except Favorites
        // - Delete Everything
        // Web version: proceed to delete everything
        // Delete everything (not preserving favorites)
        controller.stateManager.setGlobalState("taskHistory", []);
        try {
            // Remove all contents of tasks directory
            const taskDirPath = path.join(HostProvider.get().globalStorageFsPath, "tasks");
            if (await fileExistsAtPath(taskDirPath)) {
                await fs.rm(taskDirPath, { recursive: true, force: true });
            }
            // Remove checkpoints directory contents
            const checkpointsDirPath = path.join(HostProvider.get().globalStorageFsPath, "checkpoints");
            if (await fileExistsAtPath(checkpointsDirPath)) {
                await fs.rm(checkpointsDirPath, { recursive: true, force: true });
            }
        }
        catch (error) {
            HostProvider.window.showMessage({
                type: ShowMessageType.ERROR,
                message: `Encountered error while deleting task history, there may be some files left behind. Error: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
        // Update webview
        try {
            await controller.postStateToWebview();
        }
        catch (webviewErr) {
            Logger.error("Error posting to webview:", webviewErr);
        }
        return DeleteAllTaskHistoryCount.create({
            tasksDeleted: totalTasks,
        });
    }
    catch (error) {
        Logger.error("Error in deleteAllTaskHistory:", error);
        throw error;
    }
}
/**
 * Helper function to cleanup task files while preserving specified tasks
 */
async function cleanupTaskFiles(preserveTaskIds) {
    const taskDirPath = path.join(HostProvider.get().globalStorageFsPath, "tasks");
    try {
        if (await fileExistsAtPath(taskDirPath)) {
            const taskDirs = await fs.readdir(taskDirPath);
            Logger.debug(`[cleanupTaskFiles] Found ${taskDirs.length} task directories`);
            // Delete only non-preserved task directories
            for (const dir of taskDirs) {
                if (!preserveTaskIds.includes(dir)) {
                    // Task dir path is not workspace specific
                    await fs.rm(path.join(taskDirPath, dir), {
                        recursive: true,
                        force: true,
                    });
                }
            }
        }
    }
    catch (error) {
        Logger.error("Error cleaning up task files:", error);
    }
    return true;
}
//# sourceMappingURL=deleteAllTaskHistory.js.map