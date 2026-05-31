/**
 * Sync module - provides queue-based syncing to S3/R2 storage.
 *
 * This module coordinates the SyncQueue and SyncWorker for robust
 * data synchronization that doesn't block the main extension flow.
 *
 * Uses JSON file storage for:
 * - Data persistence across restarts
 * - No native module dependencies (VS Code compatible)
 * - Atomic file writes for safety
 */
import * as path from "node:path";
import { HostProvider } from "@/hosts/host-provider";
import { Logger } from "@/shared/services/Logger";
import { blobStorage } from "../../storage/ClineBlobStorage";
import { backfillTasks } from "./backfill";
import { SyncQueue } from "./queue";
import { disposeSyncWorker, initSyncWorker } from "./worker";
// Re-export types and functions
export { SyncQueue } from "./queue";
export { disposeSyncWorker, SyncWorker } from "./worker";
let syncQueueInstance = null;
/**
 * Get the sync queue file path.
 */
function getSyncQueuePath() {
    return path.join(HostProvider.get().globalStorageFsPath, "cache", "sync-queue.json");
}
/**
 * Get the global SyncQueue instance.
 * Returns null if S3 storage is not configured.
 */
function getSyncQueue() {
    if (!blobStorage.isReady()) {
        return null;
    }
    if (!syncQueueInstance) {
        syncQueueInstance = SyncQueue.getInstance(getSyncQueuePath());
    }
    return syncQueueInstance;
}
/**
 * Initialize the sync system (queue + worker).
 * Should be called during extension activation if S3 storage is configured.
 *
 * @param options Worker configuration options (includes blob store settings)
 * @returns The SyncWorker instance, or null if S3 is not configured
 */
function init(options) {
    if (!options?.userDistinctId) {
        return null;
    }
    // Initialize blob storage with the provided settings
    blobStorage.init(options);
    if (!blobStorage.isReady()) {
        return null;
    }
    const queue = getSyncQueue();
    if (!queue) {
        return null;
    }
    const worker = initSyncWorker(queue, options);
    worker.start();
    if (options.backfillEnabled) {
        backfillTasks().catch((err) => Logger.error("Backfill tasks failed:", err));
    }
    return worker;
}
/**
 * Dispose the sync system.
 * Should be called during extension deactivation.
 */
async function dispose() {
    await disposeSyncWorker();
    if (syncQueueInstance) {
        syncQueueInstance.close();
        syncQueueInstance = null;
    }
    SyncQueue.reset();
}
/**
 * Convenience function to enqueue data for sync.
 * This is a fire-and-forget operation - errors are logged but not thrown.
 *
 * @param taskId Task identifier
 * @param key File key (e.g., "api_conversation_history.json")
 * @param data Data to sync
 */
function enqueue(taskId, key, data) {
    try {
        const queue = getSyncQueue();
        if (!queue || !data || !key) {
            return;
        }
        queue.enqueue(taskId, key, data);
    }
    catch (err) {
        Logger.error(`Failed to enqueue ${taskId}/${key} for sync:`, err);
    }
}
export function syncWorker() {
    return {
        init,
        dispose,
        getSyncQueue,
        enqueue,
    };
}
//# sourceMappingURL=sync.js.map