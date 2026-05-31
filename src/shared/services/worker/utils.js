/**
 * Parse task timestamp from taskId.
 * Task IDs are generated using Date.now().toString().
 */
export function getTaskTimestamp(taskId) {
    const timestamp = parseInt(taskId, 10);
    return Number.isNaN(timestamp) ? undefined : timestamp;
}
//# sourceMappingURL=utils.js.map