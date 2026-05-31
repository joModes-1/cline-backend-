import { nanoid } from "nanoid";
/**
 * Session singleton for tracking current session statistics.
 * Used by CLI to display interaction summary.
 */
export class Session {
    static instance = null;
    sessionId;
    sessionStartTime;
    toolCalls = [];
    apiTimeMs = 0;
    toolTimeMs = 0;
    // Track in-flight operations
    currentApiCallStart = null;
    inFlightToolCalls = new Map();
    // Resource tracking
    initialCpuUsage;
    peakMemoryBytes = 0;
    constructor() {
        this.sessionId = nanoid(10);
        this.sessionStartTime = Date.now();
        this.initialCpuUsage = process.cpuUsage();
        this.updatePeakMemory();
    }
    /**
     * Update peak memory if current usage is higher.
     */
    updatePeakMemory() {
        const memUsage = process.memoryUsage();
        if (memUsage.rss > this.peakMemoryBytes) {
            this.peakMemoryBytes = memUsage.rss;
        }
    }
    /**
     * Get current resource usage for this process.
     */
    getResourceUsage() {
        this.updatePeakMemory();
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage(this.initialCpuUsage);
        return {
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss,
            // cpuUsage returns microseconds, convert to milliseconds
            userCpuMs: cpuUsage.user / 1000,
            systemCpuMs: cpuUsage.system / 1000,
        };
    }
    /**
     * Get the singleton instance, creating it if necessary.
     */
    static get() {
        if (!Session.instance) {
            Session.instance = new Session();
        }
        return Session.instance;
    }
    /**
     * Reset the session (creates a new session with fresh ID and stats).
     */
    static reset() {
        Session.instance = new Session();
        return Session.instance;
    }
    /**
     * Get the current session ID.
     */
    getSessionId() {
        return this.sessionId;
    }
    /**
     * Record the start of an API call.
     */
    startApiCall() {
        this.currentApiCallStart = Date.now();
    }
    /**
     * Record the end of an API call.
     */
    endApiCall() {
        if (this.currentApiCallStart !== null) {
            this.apiTimeMs += Date.now() - this.currentApiCallStart;
            this.currentApiCallStart = null;
        }
    }
    /**
     * Update a tool call - starts tracking if new, updates lastUpdateTime if existing.
     * @param callId - Unique identifier for this tool call
     * @param toolName - The name of the tool (required when starting a new call)
     * @param success - Optional success status (only set when finalizing)
     */
    updateToolCall(callId, toolName, success) {
        const now = Date.now();
        const existing = this.inFlightToolCalls.get(callId);
        if (existing) {
            // Update existing tool call
            existing.lastUpdateTime = now;
            if (success !== undefined) {
                existing.success = success;
            }
            return;
        }
        // Start tracking new tool call
        this.inFlightToolCalls.set(callId, {
            name: toolName,
            startTime: now,
            lastUpdateTime: now,
        });
    }
    /**
     * Add API time directly (useful when timing is tracked elsewhere).
     */
    addApiTime(ms) {
        this.apiTimeMs += ms;
    }
    /**
     * Finalize a request - moves all in-flight tool calls to completed and calculates durations.
     * Call this when an API request completes to close out all pending tool calls.
     */
    finalizeRequest() {
        for (const [callId, record] of this.inFlightToolCalls) {
            const duration = record.lastUpdateTime - record.startTime;
            this.toolTimeMs += duration;
            this.toolCalls.push({
                name: record.name,
                success: record.success,
                startTime: record.startTime,
                lastUpdateTime: record.lastUpdateTime,
            });
            this.inFlightToolCalls.delete(callId);
        }
    }
    /**
     * Get all session statistics.
     * Includes in-flight tool calls in the totals using their lastUpdateTime as end time.
     */
    getStats() {
        this.finalizeRequest();
        // Combine completed and in-flight for totals
        const allToolCalls = this.toolCalls;
        const successful = allToolCalls.filter((t) => t.success === true).length;
        const failed = allToolCalls.filter((t) => t.success === false).length;
        return {
            sessionId: this.sessionId,
            totalToolCalls: allToolCalls.length,
            successfulToolCalls: successful,
            failedToolCalls: failed,
            sessionStartTime: this.sessionStartTime,
            apiTimeMs: this.apiTimeMs,
            toolTimeMs: this.toolTimeMs,
            resources: this.getResourceUsage(),
            peakMemoryBytes: this.peakMemoryBytes,
        };
    }
    /**
     * Get the wall time (time since session started) in milliseconds.
     */
    getWallTimeMs() {
        return Date.now() - this.sessionStartTime;
    }
    /**
     * Get the session start time as a Date object.
     */
    getStartTime() {
        return new Date(this.sessionStartTime);
    }
    /**
     * Get the current time (session end time) as a Date object.
     */
    getEndTime() {
        return new Date();
    }
    /**
     * Format a timestamp for display (e.g., "2:34:56 PM").
     */
    formatTime(date) {
        return date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        });
    }
    /**
     * Get the agent active time (API time + tool time) in milliseconds.
     * Includes in-flight tool calls.
     */
    getAgentActiveTimeMs() {
        const stats = this.getStats();
        return this.apiTimeMs + stats.toolTimeMs;
    }
    /**
     * Get the success rate as a percentage (0-100).
     * Includes in-flight tool calls.
     */
    getSuccessRate() {
        const stats = this.getStats();
        if (stats.totalToolCalls === 0) {
            return 0;
        }
        return (stats.successfulToolCalls / stats.totalToolCalls) * 100;
    }
}
//# sourceMappingURL=Session.js.map