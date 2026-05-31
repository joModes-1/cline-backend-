import { Logger } from "@/shared/services/Logger";
/**
 * Global registry for tracking active hook processes.
 *
 * Purpose:
 * - Prevents zombie processes by tracking all running hooks
 * - Enables cleanup on extension deactivation
 * - Provides visibility into active hook executions
 *
 * Usage:
 * - HookProcess automatically registers/unregisters itself
 * - Extension deactivation calls terminateAll()
 * - Can query active count for monitoring/debugging
 */
export class HookProcessRegistry {
    static activeProcesses = new Set();
    /**
     * Register a hook process as active.
     * Called by HookProcess when execution starts.
     */
    static register(process) {
        HookProcessRegistry.activeProcesses.add(process);
    }
    /**
     * Unregister a hook process (completed or failed).
     * Called by HookProcess when execution ends.
     */
    static unregister(process) {
        HookProcessRegistry.activeProcesses.delete(process);
    }
    /**
     * Terminate all active hook processes.
     * Called during extension deactivation to prevent zombie processes.
     */
    static async terminateAll() {
        const processes = Array.from(HookProcessRegistry.activeProcesses);
        if (processes.length > 0) {
            Logger.log(`[HookProcessRegistry] Terminating ${processes.length} active hook process(es)`);
            await Promise.all(processes.map((p) => p.terminate()));
            HookProcessRegistry.activeProcesses.clear();
        }
    }
    /**
     * Get the number of currently active hook processes.
     * Useful for monitoring and debugging.
     */
    static getActiveCount() {
        return HookProcessRegistry.activeProcesses.size;
    }
    /**
     * Clear the registry (for testing only).
     * @internal
     */
    static resetForTesting() {
        HookProcessRegistry.activeProcesses.clear();
    }
}
//# sourceMappingURL=HookProcessRegistry.js.map