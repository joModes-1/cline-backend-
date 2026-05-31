/**
 * Code Execution Type Definitions
 *
 * Types for running code in sandboxed workspaces
 */
/**
 * Default execution limits
 */
export const DEFAULT_EXECUTION_LIMITS = {
    maxExecutionTime: 30,
    maxMemory: 256,
    maxOutputSize: 1024 * 1024, // 1MB
    maxConcurrentExecutions: 5,
};
/**
 * Check if execution completed successfully
 */
export function isExecutionSuccessful(result) {
    return result.status === 'success' && result.exitCode === 0;
}
/**
 * Check if execution is complete (terminal state)
 */
export function isExecutionComplete(status) {
    return ['success', 'error', 'timeout', 'cancelled'].includes(status);
}
/**
 * Get language from file extension
 */
export function getLanguageFromExtension(ext) {
    const extMap = {
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.go': 'go',
        '.rs': 'rust',
        '.cpp': 'cpp',
        '.cc': 'cpp',
        '.cxx': 'cpp',
        '.c': 'cpp',
        '.cs': 'csharp',
        '.rb': 'ruby',
        '.php': 'php',
    };
    const lowerExt = ext.toLowerCase();
    return extMap[lowerExt];
}
/**
 * Generate execution ID
 */
export function generateExecutionId() {
    return `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
//# sourceMappingURL=execution.js.map