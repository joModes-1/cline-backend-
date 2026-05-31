/**
 * Terminal Type Definitions
 *
 * Types for WebSocket-based terminal sessions
 */
/**
 * Default terminal configuration
 */
export const DEFAULT_TERMINAL_CONFIG = {
    shell: '/bin/bash',
    cwd: '/workspace',
    env: {},
    encoding: 'utf-8',
    handleFlowControl: true,
    flowControlPause: '\\x13', // XOFF
    flowControlResume: '\\x11', // XON
    scrollback: 1000,
    tabStopWidth: 8,
};
/**
 * Available shells
 */
export const COMMON_SHELLS = [
    { path: '/bin/bash', name: 'bash', isDefault: true },
    { path: '/bin/sh', name: 'sh', isDefault: false },
    { path: '/bin/zsh', name: 'zsh', isDefault: false },
];
/**
 * WebSocket close codes for terminal
 */
export var TerminalCloseCode;
(function (TerminalCloseCode) {
    TerminalCloseCode[TerminalCloseCode["NORMAL"] = 1000] = "NORMAL";
    TerminalCloseCode[TerminalCloseCode["GOING_AWAY"] = 1001] = "GOING_AWAY";
    TerminalCloseCode[TerminalCloseCode["PROTOCOL_ERROR"] = 1002] = "PROTOCOL_ERROR";
    TerminalCloseCode[TerminalCloseCode["UNSUPPORTED_DATA"] = 1003] = "UNSUPPORTED_DATA";
    TerminalCloseCode[TerminalCloseCode["NO_STATUS"] = 1005] = "NO_STATUS";
    TerminalCloseCode[TerminalCloseCode["ABNORMAL_CLOSE"] = 1006] = "ABNORMAL_CLOSE";
    TerminalCloseCode[TerminalCloseCode["INVALID_DATA"] = 1007] = "INVALID_DATA";
    TerminalCloseCode[TerminalCloseCode["POLICY_VIOLATION"] = 1008] = "POLICY_VIOLATION";
    TerminalCloseCode[TerminalCloseCode["MESSAGE_TOO_BIG"] = 1009] = "MESSAGE_TOO_BIG";
    TerminalCloseCode[TerminalCloseCode["MANDATORY_EXTENSION"] = 1010] = "MANDATORY_EXTENSION";
    TerminalCloseCode[TerminalCloseCode["INTERNAL_ERROR"] = 1011] = "INTERNAL_ERROR";
    TerminalCloseCode[TerminalCloseCode["SERVICE_RESTART"] = 1012] = "SERVICE_RESTART";
    TerminalCloseCode[TerminalCloseCode["TRY_AGAIN_LATER"] = 1013] = "TRY_AGAIN_LATER";
    TerminalCloseCode[TerminalCloseCode["BAD_GATEWAY"] = 1014] = "BAD_GATEWAY";
    TerminalCloseCode[TerminalCloseCode["TLS_HANDSHAKE"] = 1015] = "TLS_HANDSHAKE";
    // Custom codes
    TerminalCloseCode[TerminalCloseCode["SESSION_EXPIRED"] = 4000] = "SESSION_EXPIRED";
    TerminalCloseCode[TerminalCloseCode["WORKSPACE_STOPPED"] = 4001] = "WORKSPACE_STOPPED";
    TerminalCloseCode[TerminalCloseCode["PERMISSION_DENIED"] = 4002] = "PERMISSION_DENIED";
    TerminalCloseCode[TerminalCloseCode["WORKSPACE_ERROR"] = 4003] = "WORKSPACE_ERROR";
})(TerminalCloseCode || (TerminalCloseCode = {}));
/**
 * Check if terminal is active
 */
export function isTerminalActive(status) {
    return status === 'connected' || status === 'connecting';
}
/**
 * Generate terminal session ID
 */
export function generateTerminalId() {
    return `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Create resize message
 */
export function createResizeMessage(rows, cols) {
    return {
        type: 'resize',
        rows,
        cols,
        timestamp: new Date(),
    };
}
/**
 * Create input message
 */
export function createInputMessage(data) {
    return {
        type: 'input',
        data,
        timestamp: new Date(),
    };
}
/**
 * Create output message
 */
export function createOutputMessage(data) {
    return {
        type: 'output',
        data,
        timestamp: new Date(),
    };
}
/**
 * Default terminal dimensions
 */
export const DEFAULT_TERMINAL_DIMENSIONS = {
    rows: 24,
    cols: 80,
    width: 800,
    height: 450,
};
//# sourceMappingURL=terminal.js.map