import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import React from "react";
import { COLORS } from "../constants/colors";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { jsonParseSafe } from "../utils/parser";
const TREE_PREFIX_WIDTH = 5;
const MIN_PROMPT_WIDTH = 20;
const DotRow = ({ children, color, flashing = false, }) => (React.createElement(Box, { flexDirection: "row" },
    React.createElement(Box, { width: 2 }, flashing ? (React.createElement(Text, { color: color },
        React.createElement(Spinner, { type: "toggle8" }))) : (React.createElement(Text, { color: color }, "\u23FA"))),
    React.createElement(Box, { flexGrow: 1 }, children)));
function formatCompactTokens(tokens) {
    const value = Number.isFinite(tokens) ? Math.max(0, tokens || 0) : 0;
    return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
    })
        .format(value)
        .toLowerCase();
}
function formatCompactCost(cost) {
    const value = Number.isFinite(cost) ? Math.max(0, cost || 0) : 0;
    const maximumFractionDigits = value >= 0.01 ? 2 : 4;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits,
    }).format(value);
}
function formatSubagentStatsValues(toolCalls, contextTokens, totalCost, latestToolCall) {
    const safeToolCalls = Number.isFinite(toolCalls) ? Math.max(0, toolCalls || 0) : 0;
    const toolUses = safeToolCalls === 1 ? "tool use" : "tool uses";
    const tokensUsed = formatCompactTokens(contextTokens || 0);
    const formattedCost = formatCompactCost(totalCost || 0);
    const stats = `${safeToolCalls} ${toolUses} · ${tokensUsed} tokens · ${formattedCost}`;
    const latestTool = latestToolCall?.trim();
    return latestTool ? `${latestTool} · ${stats}` : stats;
}
function wrapPrompt(text, width) {
    if (!text) {
        return [""];
    }
    const normalizedWidth = Math.max(1, width);
    const wrappedLines = [];
    const paragraphs = text.split("\n");
    for (const paragraph of paragraphs) {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            wrappedLines.push("");
            continue;
        }
        let line = "";
        for (const word of words) {
            if (!line) {
                if (word.length <= normalizedWidth) {
                    line = word;
                    continue;
                }
                let remaining = word;
                while (remaining.length > normalizedWidth) {
                    wrappedLines.push(remaining.slice(0, normalizedWidth));
                    remaining = remaining.slice(normalizedWidth);
                }
                line = remaining;
                continue;
            }
            if (line.length + 1 + word.length <= normalizedWidth) {
                line = `${line} ${word}`;
                continue;
            }
            wrappedLines.push(line);
            if (word.length <= normalizedWidth) {
                line = word;
                continue;
            }
            let remaining = word;
            while (remaining.length > normalizedWidth) {
                wrappedLines.push(remaining.slice(0, normalizedWidth));
                remaining = remaining.slice(normalizedWidth);
            }
            line = remaining;
        }
        if (line) {
            wrappedLines.push(line);
        }
    }
    return wrappedLines.length > 0 ? wrappedLines : [text];
}
const TreePromptRow = ({ prefix, continuationPrefix, prompt, promptWidth, color }) => {
    const lines = wrapPrompt(prompt, promptWidth);
    return (React.createElement(Box, { flexDirection: "column", width: "100%" }, lines.map((line, index) => (React.createElement(Box, { flexDirection: "row", key: `${line}-${index}`, width: "100%" },
        React.createElement(Box, { flexShrink: 0, width: TREE_PREFIX_WIDTH }, index === 0 ? prefix : React.createElement(Text, { color: "gray" }, continuationPrefix)),
        React.createElement(Box, { flexGrow: 1 },
            React.createElement(Text, { color: color }, line)))))));
};
const TreeStatsRow = ({ prefix, stats }) => (React.createElement(Box, { flexDirection: "row", width: "100%" },
    React.createElement(Box, { flexShrink: 0, width: TREE_PREFIX_WIDTH },
        React.createElement(Text, { color: "gray" }, prefix)),
    React.createElement(Box, { flexGrow: 1 },
        React.createElement(Text, { color: "gray" },
            "\u23BF ",
            stats))));
export const SubagentMessage = ({ message, mode, isStreaming }) => {
    const { type, ask, say, text, partial } = message;
    const toolColor = mode === "plan" ? "yellow" : COLORS.primaryBlue;
    const { columns } = useTerminalSize();
    const promptWidth = Math.max(MIN_PROMPT_WIDTH, columns - 2 - TREE_PREFIX_WIDTH);
    if ((type === "ask" && ask === "use_subagents") || say === "use_subagents") {
        const parsed = text
            ? jsonParseSafe(text, {
                prompts: [],
            })
            : { prompts: [] };
        const prompts = (parsed.prompts || []).map((prompt) => prompt?.trim()).filter(Boolean);
        if (prompts.length === 0) {
            return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
                React.createElement(DotRow, { color: toolColor },
                    React.createElement(Text, { color: toolColor }, "Cline wants to run subagents:"))));
        }
        const singular = prompts.length === 1;
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                React.createElement(Text, { color: toolColor }, singular ? "Cline wants to run a subagent:" : "Cline wants to run subagents:")),
            React.createElement(Box, { flexDirection: "column", marginLeft: 2, width: "100%" }, prompts.map((prompt, index) => {
                const isLastPrompt = index === prompts.length - 1;
                const branch = isLastPrompt ? "└─" : "├─";
                const continuationPrefix = isLastPrompt ? "     " : "│    ";
                const shouldShowPromptStats = partial !== true || !isLastPrompt;
                return (React.createElement(Box, { flexDirection: "column", key: `${prompt}-${index}` },
                    React.createElement(TreePromptRow, { color: toolColor, continuationPrefix: continuationPrefix, prefix: React.createElement(Text, { color: toolColor }, `${branch} `), prompt: prompt, promptWidth: promptWidth }),
                    shouldShowPromptStats && (React.createElement(TreeStatsRow, { prefix: continuationPrefix, stats: formatSubagentStatsValues(undefined, undefined, undefined) }))));
            }))));
    }
    if (say === "subagent" && text) {
        const parsed = jsonParseSafe(text, {
            status: "running",
            total: 0,
            completed: 0,
            successes: 0,
            failures: 0,
            toolCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            contextWindow: 0,
            maxContextTokens: 0,
            maxContextUsagePercentage: 0,
            items: [],
        });
        const items = parsed.items || [];
        if (items.length === 0) {
            return null;
        }
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                React.createElement(Text, { color: toolColor }, items.length === 1 ? "Cline is running a subagent:" : "Cline is running subagents:")),
            React.createElement(Box, { flexDirection: "column", marginLeft: 2, width: "100%" }, items.map((entry, index) => {
                const isLastEntry = index === items.length - 1;
                const branch = isLastEntry ? "└─" : "├─";
                const continuationPrefix = isLastEntry ? "     " : "│    ";
                const key = `${entry.index}-${index}`;
                const shouldShowStats = true;
                if (entry.status === "completed") {
                    return (React.createElement(Box, { flexDirection: "column", key: key },
                        React.createElement(TreePromptRow, { color: "green", continuationPrefix: continuationPrefix, prefix: React.createElement(Box, { flexDirection: "row" },
                                React.createElement(Text, { color: "gray" }, `${branch} `),
                                React.createElement(Text, { color: "green" }, "\u2713")), prompt: entry.prompt, promptWidth: promptWidth }),
                        React.createElement(TreeStatsRow, { prefix: continuationPrefix, stats: formatSubagentStatsValues(entry.toolCalls, entry.contextTokens, entry.totalCost, entry.latestToolCall) })));
                }
                if (entry.status === "failed") {
                    return (React.createElement(Box, { flexDirection: "column", key: key },
                        React.createElement(TreePromptRow, { color: "red", continuationPrefix: continuationPrefix, prefix: React.createElement(Box, { flexDirection: "row" },
                                React.createElement(Text, { color: "gray" }, `${branch} `),
                                React.createElement(Text, { color: "red" }, "\u2717")), prompt: entry.prompt, promptWidth: promptWidth }),
                        React.createElement(TreeStatsRow, { prefix: continuationPrefix, stats: formatSubagentStatsValues(entry.toolCalls, entry.contextTokens, entry.totalCost, entry.latestToolCall) })));
                }
                return (React.createElement(Box, { flexDirection: "column", key: key },
                    React.createElement(TreePromptRow, { color: toolColor, continuationPrefix: continuationPrefix, prefix: React.createElement(Box, { flexDirection: "row" },
                            React.createElement(Text, { color: "gray" },
                                branch,
                                " "),
                            entry.status === "running" ? (React.createElement(Text, { color: toolColor },
                                React.createElement(Spinner, { type: "dots" }))) : (React.createElement(Text, { color: toolColor }, "\u2022"))), prompt: entry.prompt, promptWidth: promptWidth }),
                    shouldShowStats && (React.createElement(TreeStatsRow, { prefix: continuationPrefix, stats: formatSubagentStatsValues(entry.toolCalls, entry.contextTokens, entry.totalCost, entry.latestToolCall) }))));
            }))));
    }
    return null;
};
//# sourceMappingURL=SubagentMessage.js.map