/**
 * Enum defining different reasons why a user might be logged out
 * Used for telemetry tracking to understand logout patterns
 */
export var LogoutReason;
(function (LogoutReason) {
    /** User explicitly clicked logout button in UI */
    LogoutReason["USER_INITIATED"] = "user_initiated";
    /** Auth tokens were cleared in another VSCode window (cross-window sync) */
    LogoutReason["CROSS_WINDOW_SYNC"] = "cross_window_sync";
    /** Auth provider encountered an error and cleared tokens */
    LogoutReason["ERROR_RECOVERY"] = "error_recovery";
    /** Unknown or unspecified reason */
    LogoutReason["UNKNOWN"] = "unknown";
})(LogoutReason || (LogoutReason = {}));
//# sourceMappingURL=types.js.map