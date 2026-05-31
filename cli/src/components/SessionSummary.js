import { Box, Text } from "ink";
import React from "react";
import { Session } from "@/shared/services/Session";
/**
 * Format milliseconds to a human-readable duration string
 */
function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    const seconds = ms / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}
/**
 * Format a percentage value
 */
function formatPercent(value, total) {
    if (total === 0)
        return "0.0%";
    return `${((value / total) * 100).toFixed(1)}%`;
}
/**
 * Format bytes to a human-readable string (KB, MB, GB)
 */
function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${kb.toFixed(1)}KB`;
    }
    const mb = kb / 1024;
    if (mb < 1024) {
        return `${mb.toFixed(1)}MB`;
    }
    const gb = mb / 1024;
    return `${gb.toFixed(2)}GB`;
}
/**
 * Displays session statistics when the CLI exits.
 * Shows tool call counts, success rate, and timing breakdown.
 */
export const SessionSummary = ({ width }) => {
    const session = Session.get();
    const stats = session.getStats();
    const wallTimeMs = session.getWallTimeMs();
    const agentActiveMs = session.getAgentActiveTimeMs();
    // Don't show if session just started (less than 1 second)
    if (wallTimeMs < 1000) {
        return null;
    }
    return (React.createElement(Box, { borderColor: "gray", borderStyle: "single", flexDirection: "column", paddingX: 1, width: width },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true }, "Interaction Summary")),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "Session ID:")),
            React.createElement(Text, null, stats.sessionId)),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "Session Time:")),
            React.createElement(Text, null,
                session.formatTime(session.getStartTime()),
                " \u2192 ",
                session.formatTime(session.getEndTime()))),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "Tool Calls:")),
            React.createElement(Text, null, stats.totalToolCalls)),
        React.createElement(Box, { marginBottom: 0 },
            React.createElement(Text, { bold: true }, "Performance")),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "Wall Time:")),
            React.createElement(Text, null, formatDuration(wallTimeMs))),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "Agent Active:")),
            React.createElement(Text, null, formatDuration(agentActiveMs))),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, " \u00BB API Time:")),
            React.createElement(Text, null,
                formatDuration(stats.apiTimeMs),
                " ",
                React.createElement(Text, { color: "gray" },
                    "(",
                    formatPercent(stats.apiTimeMs, agentActiveMs),
                    ")"))),
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, " \u00BB Tool Time:")),
            React.createElement(Text, null,
                formatDuration(stats.toolTimeMs),
                " ",
                React.createElement(Text, { color: "gray" },
                    "(",
                    formatPercent(stats.toolTimeMs, agentActiveMs),
                    ")"))),
        React.createElement(Box, { marginBottom: 0 },
            React.createElement(Text, { bold: true }, "Resources")),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "Memory (RSS):")),
            React.createElement(Text, null, formatBytes(stats.resources.rss))),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "Peak Memory:")),
            React.createElement(Text, null, formatBytes(stats.peakMemoryBytes))),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "Heap Used:")),
            React.createElement(Text, null,
                formatBytes(stats.resources.heapUsed),
                " ",
                React.createElement(Text, { color: "gray" },
                    "/ ",
                    formatBytes(stats.resources.heapTotal)))),
        React.createElement(Box, null,
            React.createElement(Box, { width: 20 },
                React.createElement(Text, { color: "gray" }, "CPU Time:")),
            React.createElement(Text, null,
                formatDuration(stats.resources.userCpuMs + stats.resources.systemCpuMs),
                " ",
                React.createElement(Text, { color: "gray" },
                    "(user: ",
                    formatDuration(stats.resources.userCpuMs),
                    ", sys: ",
                    formatDuration(stats.resources.systemCpuMs),
                    ")")))));
};
//# sourceMappingURL=SessionSummary.js.map