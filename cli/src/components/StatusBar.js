/**
 * Status bar component
 * Shows git branch, model, context window usage, token count, and cost
 */
import { execSync } from "child_process";
import { Box, Text } from "ink";
import React, { useEffect, useState } from "react";
/**
 * Get current git branch name
 */
function getGitBranch(cwd) {
    try {
        const branch = execSync("git rev-parse --abbrev-ref HEAD", {
            cwd: cwd || process.cwd(),
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        return branch;
    }
    catch {
        return null;
    }
}
/**
 * Get directory basename
 */
function getDirName(cwd) {
    const path = cwd || process.cwd();
    return path.split("/").pop() || path;
}
/**
 * Format number with commas
 */
function formatNumber(num) {
    return num.toLocaleString();
}
/**
 * Create a progress bar for context window usage
 */
function createContextBar(used, total, width = 8) {
    const ratio = Math.min(used / total, 1);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    return "█".repeat(filled) + "░".repeat(empty);
}
export const StatusBar = ({ modelId, tokensIn = 0, tokensOut = 0, totalCost = 0, contextWindowSize = 200000, // Default Claude context window
cwd, }) => {
    const [branch, setBranch] = useState(null);
    const dirName = getDirName(cwd);
    useEffect(() => {
        setBranch(getGitBranch(cwd));
    }, [cwd]);
    const totalTokens = tokensIn + tokensOut;
    const contextBar = createContextBar(totalTokens, contextWindowSize);
    // Format model ID for display (shorten if needed)
    const displayModel = modelId.length > 20 ? modelId.substring(0, 17) + "..." : modelId;
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Box, { gap: 1 },
            React.createElement(Text, { color: "gray" },
                dirName,
                branch && (React.createElement(Text, { color: "gray" },
                    " ",
                    "(",
                    React.createElement(Text, { color: "cyan" }, branch),
                    ")"))),
            React.createElement(Text, { color: "gray" }, "|"),
            React.createElement(Text, { color: "white" }, displayModel),
            React.createElement(Text, { color: "blue" }, contextBar),
            React.createElement(Text, { color: "gray" },
                "(",
                formatNumber(totalTokens),
                ")"),
            React.createElement(Text, { color: "gray" }, "|"),
            React.createElement(Text, { color: "green" },
                "$",
                totalCost.toFixed(4)))));
};
//# sourceMappingURL=StatusBar.js.map