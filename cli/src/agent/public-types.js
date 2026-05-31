/**
 * Public types for the Cline library API.
 *
 * This file contains types that are safe to export to library consumers.
 * It must NOT import any internal types (Controller, StateManager, etc.)
 * to keep the generated declaration files clean.
 *
 * Internal-only extensions of these types live in ./types.ts.
 */
/**
 * Lifecycle status of an ACP session.
 *
 * Represents the state machine:
 *   Idle → Processing → Idle       (normal completion)
 *   Idle → Processing → Cancelled  (cancellation, then back to Idle on next prompt)
 */
export var AcpSessionStatus;
(function (AcpSessionStatus) {
    /** Session is idle, waiting for a prompt */
    AcpSessionStatus["Idle"] = "idle";
    /** Session is actively processing a prompt */
    AcpSessionStatus["Processing"] = "processing";
    /** Session processing was cancelled */
    AcpSessionStatus["Cancelled"] = "cancelled";
})(AcpSessionStatus || (AcpSessionStatus = {}));
//# sourceMappingURL=public-types.js.map