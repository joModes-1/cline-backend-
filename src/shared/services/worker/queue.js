import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "@/shared/services/Logger";
import { SEVEN_DAYS_MS } from "./worker";
/**
 * A JSON file-backed queue for syncing task data to remote storage.
 *
 * Uses atomic file writes for:
 * - Data persistence across restarts
 * - No native module dependencies (VS Code compatible)
 *
 * Benefits:
 * - Guaranteed delivery even if remote storage is temporarily down
 * - Supports backfill of historic tasks
 * - No blocking on remote storage operations
 */
export class SyncQueue {
    queuePath;
    data = { items: {} };
    static instance = null;
    writeTimeout = null;
    isDirty = false;
    /**
     * Get the singleton instance.
     * @param queuePath Path to the JSON queue file
     */
    static getInstance(queuePath) {
        if (!SyncQueue.instance) {
            SyncQueue.instance = new SyncQueue(queuePath);
        }
        return SyncQueue.instance;
    }
    /**
     * Reset the singleton (for testing).
     */
    static reset() {
        if (SyncQueue.instance) {
            SyncQueue.instance.close();
            SyncQueue.instance = null;
        }
    }
    constructor(queuePath) {
        this.queuePath = queuePath;
        // Ensure directory exists
        const dir = path.dirname(queuePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Load existing queue data
        this.load();
    }
    /**
     * Load queue data from disk.
     */
    load() {
        try {
            if (fs.existsSync(this.queuePath)) {
                const content = fs.readFileSync(this.queuePath, "utf-8");
                this.data = JSON.parse(content);
            }
        }
        catch (error) {
            Logger.error("[SyncQueue] Failed to load queue data:", error);
            this.data = { items: {} };
        }
    }
    /**
     * Schedule a debounced write to disk.
     */
    scheduleWrite() {
        this.isDirty = true;
        if (this.writeTimeout) {
            return; // Already scheduled
        }
        this.writeTimeout = setTimeout(() => {
            this.flush();
        }, 100); // Debounce writes by 100ms
    }
    /**
     * Immediately write queue data to disk.
     */
    flush() {
        if (this.writeTimeout) {
            clearTimeout(this.writeTimeout);
            this.writeTimeout = null;
        }
        if (!this.isDirty) {
            return;
        }
        try {
            const tmpPath = `${this.queuePath}.tmp`;
            fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), "utf-8");
            fs.renameSync(tmpPath, this.queuePath);
            this.isDirty = false;
        }
        catch (error) {
            Logger.error("[SyncQueue] Failed to write queue data:", error);
        }
    }
    /**
     * Close the queue and flush pending writes.
     */
    close() {
        this.flush();
    }
    /**
     * Queue data for sync. If an item with the same taskId/key exists,
     * it will be replaced (upsert behavior).
     *
     * @param taskId Task identifier
     * @param key File key (e.g., "api_conversation_history.json")
     * @param data Data to sync
     */
    enqueue(taskId, key, data) {
        const id = `${taskId}/${key}`;
        this.data.items[id] = {
            id,
            taskId,
            key,
            data,
            timestamp: Date.now(),
            status: "pending",
            retryCount: 0,
            lastError: null,
        };
        this.scheduleWrite();
    }
    /**
     * Get all pending items that need to be synced.
     */
    getPending() {
        return Object.values(this.data.items)
            .filter((item) => item.status === "pending")
            .sort((a, b) => b.timestamp - a.timestamp);
    }
    /**
     * Get all items regardless of status.
     */
    getAll() {
        return Object.values(this.data.items).sort((a, b) => b.timestamp - a.timestamp);
    }
    /**
     * Get failed items that may need manual intervention or retry.
     */
    getFailed() {
        return Object.values(this.data.items)
            .filter((item) => item.status === "failed")
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    /**
     * Get a specific item by taskId and key.
     */
    getItem(taskId, key) {
        const id = `${taskId}/${key}`;
        return this.data.items[id];
    }
    /**
     * Mark an item as successfully synced.
     *
     * @param taskId Task identifier
     * @param key File key
     * @param remove Whether to remove the item after marking synced (default: false)
     */
    markSynced(taskId, key, remove = false) {
        const id = `${taskId}/${key}`;
        if (remove) {
            delete this.data.items[id];
        }
        else if (this.data.items[id]) {
            this.data.items[id].status = "synced";
            this.data.items[id].lastError = null;
        }
        this.scheduleWrite();
    }
    /**
     * Mark an item as failed with an error message.
     * Increments retry count for tracking.
     *
     * @param taskId Task identifier
     * @param key File key
     * @param error Error message
     */
    markFailed(taskId, key, error) {
        const id = `${taskId}/${key}`;
        const item = this.data.items[id];
        if (item) {
            item.status = "failed";
            item.lastError = error;
            item.retryCount++;
        }
        this.scheduleWrite();
    }
    /**
     * Reset a failed item back to pending for retry.
     *
     * @param taskId Task identifier
     * @param key File key
     */
    resetToPending(taskId, key) {
        const id = `${taskId}/${key}`;
        const item = this.data.items[id];
        if (item) {
            item.status = "pending";
        }
        this.scheduleWrite();
    }
    /**
     * Remove an item from the queue entirely.
     *
     * @param taskId Task identifier
     * @param key File key
     */
    remove(taskId, key) {
        const id = `${taskId}/${key}`;
        delete this.data.items[id];
        this.scheduleWrite();
    }
    /**
     * Remove all items for a task.
     * Use this when a task is deleted.
     *
     * @param taskId Task identifier
     */
    removeTask(taskId) {
        const keysToRemove = Object.keys(this.data.items).filter((id) => id.startsWith(`${taskId}/`));
        for (const key of keysToRemove) {
            delete this.data.items[key];
        }
        this.scheduleWrite();
    }
    /**
     * Get statistics about the queue.
     */
    getStats() {
        const items = Object.values(this.data.items);
        return {
            pending: items.filter((i) => i.status === "pending").length,
            synced: items.filter((i) => i.status === "synced").length,
            failed: items.filter((i) => i.status === "failed").length,
            total: items.length,
        };
    }
    /**
     * Clean up synced items older than the specified age.
     *
     * @param maxAgeMs Maximum age in milliseconds (default: 7 days)
     * @returns Number of items cleaned up
     */
    cleanupOldSynced(maxAgeMs = SEVEN_DAYS_MS) {
        const cutoff = Date.now() - maxAgeMs;
        let count = 0;
        Object.entries(this.data.items).forEach(([key, item]) => {
            if (item.status === "synced" && item.timestamp < cutoff) {
                delete this.data.items[key];
                count++;
            }
        });
        if (count > 0) {
            this.scheduleWrite();
        }
        return count;
    }
    /**
     * Clean up failed items that have exceeded max retries.
     * This prevents the queue from growing forever when blob storage is misconfigured.
     *
     * @param maxRetries Maximum retry count before eviction (default: 5)
     * @param maxAgeMs Maximum age for failed items in milliseconds (default: 7 days)
     * @returns Number of items cleaned up
     */
    cleanupFailedItems(maxRetries = 5, maxAgeMs = SEVEN_DAYS_MS) {
        const cutoff = Date.now() - maxAgeMs;
        let count = 0;
        Object.entries(this.data.items).forEach(([key, item]) => {
            if (item.status === "failed" && (item.retryCount >= maxRetries || item.timestamp < cutoff)) {
                delete this.data.items[key];
                count++;
            }
        });
        if (count > 0) {
            this.scheduleWrite();
        }
        return count;
    }
    /**
     * Enforce a maximum queue size by removing oldest items.
     * Prioritizes removing: synced > failed (exceeded retries) > failed > pending
     *
     * @param maxSize Maximum number of items to keep (default: 1000)
     * @returns Number of items evicted
     */
    enforceMaxSize(maxSize = 1000) {
        const items = Object.entries(this.data.items);
        if (items.length <= maxSize) {
            return 0;
        }
        const toEvict = items.length - maxSize;
        // Sort by eviction priority: synced first, then failed with high retry, then failed, then pending
        // Within each category, oldest first
        const sorted = items.sort(([, a], [, b]) => {
            const priorityOf = (item) => {
                if (item.status === "synced") {
                    return 0;
                }
                if (item.status === "failed" && item.retryCount >= 5) {
                    return 1;
                }
                if (item.status === "failed") {
                    return 2;
                }
                return 3; // pending
            };
            const priorityDiff = priorityOf(a) - priorityOf(b);
            if (priorityDiff !== 0) {
                return priorityDiff;
            }
            return a.timestamp - b.timestamp; // oldest first within same priority
        });
        const keysToRemove = sorted.slice(0, toEvict).map(([key]) => key);
        for (const key of keysToRemove) {
            delete this.data.items[key];
        }
        if (keysToRemove.length > 0) {
            this.scheduleWrite();
            Logger.warn(`[SyncQueue] Evicted ${keysToRemove.length} items to enforce max size of ${maxSize}`);
        }
        return keysToRemove.length;
    }
    /**
     * Bulk enqueue multiple items.
     * More efficient than calling enqueue() multiple times.
     *
     * @param items Array of items to enqueue
     */
    enqueueBulk(items) {
        const timestamp = Date.now();
        for (const item of items) {
            const id = `${item.taskId}/${item.key}`;
            this.data.items[id] = {
                id,
                taskId: item.taskId,
                key: item.key,
                data: item.data,
                timestamp,
                status: "pending",
                retryCount: 0,
                lastError: null,
            };
        }
        this.scheduleWrite();
    }
    /**
     * Get pending items with a limit (for batch processing).
     *
     * @param limit Maximum number of items to return
     */
    getPendingBatch(limit) {
        return this.getPending().slice(0, limit);
    }
}
//# sourceMappingURL=queue.js.map