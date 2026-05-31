/**
 * Workspace Type Definitions
 *
 * Defines workspace interfaces adapted from Eclipse Che's DevWorkspace
 */
/**
 * Check if workspace is active (running or starting)
 */
export function isWorkspaceActive(status) {
    return status === 'running' || status === 'starting';
}
/**
 * Check if workspace can be started
 */
export function canStartWorkspace(status) {
    return status === 'stopped' || status === 'error';
}
/**
 * Check if workspace can be stopped
 */
export function canStopWorkspace(status) {
    return status === 'running' || status === 'starting';
}
/**
 * Check if workspace is in a terminal state
 */
export function isWorkspaceTerminal(status) {
    return status === 'stopped' || status === 'error' || status === 'deleting';
}
/**
 * Get display name for workspace status
 */
export function getWorkspaceStatusDisplay(status) {
    const displays = {
        starting: 'Starting',
        running: 'Running',
        stopped: 'Stopped',
        error: 'Error',
        terminating: 'Stopping',
        deleting: 'Deleting',
    };
    return displays[status] || status;
}
/**
 * Generate workspace ID from name
 */
export function generateWorkspaceId(name) {
    const timestamp = Date.now().toString(36);
    const sanitized = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .substring(0, 20);
    return `${sanitized}-${timestamp}`;
}
//# sourceMappingURL=workspace.js.map