/**
 * Claude Code style chat message component
 * Renders messages with:
 * - ❯ for user messages
 * - ⏺ for assistant messages and tool calls
 * - ⎿ for tool results (indented)
 */
import { CLINE_ACCOUNT_AUTH_ERROR_MESSAGE } from "@shared/ClineAccount";
import { COMMAND_OUTPUT_STRING } from "@shared/combineCommandSequences";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { lexer } from "marked";
import React from "react";
import { COLORS } from "../constants/colors";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { jsonParseSafe } from "../utils/parser";
import { getToolDescription, isFileEditTool, parseToolFromMessage } from "../utils/tools";
import { DiffView } from "./DiffView";
import { SubagentMessage } from "./SubagentMessage";
/**
 * Add "(Tab)" hint after "Act mode" mentions in plain text.
 * Case-insensitive, avoids double-adding if already present.
 */
function addActModeHint(text, keyPrefix) {
    const actModeRegex = /\bact\s+mode\b(?!\s*\(tab\))/gi;
    const parts = text.split(actModeRegex);
    const matches = text.match(actModeRegex);
    if (!matches || parts.length <= 1) {
        return [text];
    }
    const nodes = [];
    parts.forEach((part, i) => {
        if (part)
            nodes.push(part);
        if (matches[i]) {
            nodes.push(React.createElement(React.Fragment, { key: `${keyPrefix}-act-mode-${i}` },
                matches[i],
                React.createElement(Text, { color: "gray" }, " (Tab)")));
        }
    });
    return nodes;
}
/**
 * Render an array of marked tokens as Ink React nodes.
 * This is the entry point for recursive rendering — each token may
 * contain child tokens (e.g. a paragraph contains inline tokens,
 * a list contains items, etc.).
 */
function renderTokens(tokens, color) {
    return tokens.map((token, i) => renderToken(token, i, color));
}
/**
 * Render a single marked token (block or inline) as an Ink React node.
 * Handles both block-level tokens (heading, paragraph, list, code, etc.)
 * and inline tokens (strong, em, codespan, link, text).
 */
function renderToken(token, key, color) {
    switch (token.type) {
        // --- Block tokens ---
        case "heading": {
            const { depth, tokens } = token;
            return (React.createElement(Box, { key: key, marginY: depth === 1 ? 1 : 0 },
                React.createElement(Text, { bold: true, color: color }, renderTokens(tokens, color))));
        }
        case "paragraph":
            return (React.createElement(Text, { color: color, key: key }, renderTokens(token.tokens, color)));
        case "code":
            return (React.createElement(Box, { flexDirection: "column", key: key, marginY: 1 }, token.text.split("\n").map((line, i) => (React.createElement(Text, { color: "cyan", key: i }, line || " ")))));
        case "list": {
            const { ordered, start, items } = token;
            return (React.createElement(Box, { flexDirection: "column", key: key }, items.map((item, i) => (React.createElement(Box, { flexDirection: "row", key: i },
                React.createElement(Text, { color: "gray" }, ordered ? `${Number(start ?? 1) + i}. ` : "• "),
                React.createElement(Box, { flexDirection: "column", flexGrow: 1 }, renderTokens(item.tokens, color)))))));
        }
        case "blockquote":
            return (React.createElement(Box, { flexDirection: "row", key: key },
                React.createElement(Text, { color: "gray" }, "\u2502 "),
                React.createElement(Box, { flexDirection: "column" }, renderTokens(token.tokens, color))));
        case "space":
            return React.createElement(Text, { key: key }, " ");
        // --- Inline tokens ---
        case "strong":
            return (React.createElement(Text, { bold: true, color: color, key: key }, renderTokens(token.tokens, color)));
        case "em":
            return (React.createElement(Text, { color: color, italic: true, key: key }, renderTokens(token.tokens, color)));
        case "codespan":
            return React.createElement(Text, { key: key }, token.text);
        case "link": {
            const { text, href } = token;
            return (React.createElement(Text, { color: color, key: key }, text && text !== href ? `${text} (${href})` : href));
        }
        case "text": {
            const { text, tokens } = token;
            if (tokens?.length) {
                return (React.createElement(Text, { color: color, key: key }, renderTokens(tokens, color)));
            }
            return (React.createElement(Text, { color: color, key: key }, addActModeHint(text, `${key}`)));
        }
        // Fallback for any unhandled token type
        default:
            return "raw" in token ? (React.createElement(Text, { color: color, key: key }, token.raw)) : null;
    }
}
/**
 * Render a markdown string as Ink components.
 * Uses marked's lexer to parse markdown into tokens, then renders
 * each token to the appropriate Ink component.
 */
const MarkdownText = ({ children, color }) => {
    const tokens = lexer(children);
    return React.createElement(Box, { flexDirection: "column" }, renderTokens(tokens, color));
};
/**
 * Two-column layout for messages with a dot prefix.
 * Keeps content from wrapping under the dot.
 *
 * For this to work properly, parent containers must have width="100%"
 * so flexGrow={1} on the content box has a reference width to fill.
 */
const DotRow = ({ children, color, flashing = false, }) => (React.createElement(Box, { flexDirection: "row" },
    React.createElement(Box, { width: 2 }, flashing ? (React.createElement(Text, { color: color },
        React.createElement(Spinner, { type: "toggle8" }))) : (React.createElement(Text, { color: color }, "\u23FA"))),
    React.createElement(Box, { flexGrow: 1 }, children)));
/**
 * Two-column layout for tool results with ⎿ prefix.
 * Keeps content from wrapping under the prefix.
 */
const ResultRow = ({ children, isFirst }) => (React.createElement(Box, { flexDirection: "row" },
    React.createElement(Box, { width: 3 },
        React.createElement(Text, { color: "gray" }, isFirst ? "⎿ " : "  ")),
    React.createElement(Box, { flexGrow: 1 }, children)));
/**
 * Get the primary argument to display for a tool (file path, command, url, etc.)
 */
function getToolMainArg(_toolName, args) {
    // Search files: show 'regex' in path
    if (typeof args.regex === "string" && typeof args.path === "string") {
        return `'${args.regex}' in ${args.path}`;
    }
    // File path
    if (typeof args.path === "string")
        return args.path;
    if (typeof args.file_path === "string")
        return args.file_path;
    // Command - truncate long commands
    if (typeof args.command === "string") {
        return args.command.length > 120 ? args.command.substring(0, 117) + "..." : args.command;
    }
    // URL
    if (typeof args.url === "string")
        return args.url;
    // Search query
    if (typeof args.query === "string")
        return args.query;
    return "";
}
/**
 * Render a tool call in webview style: "Cline wants to read this file:" / "Cline read this file:"
 */
const ToolCallText = ({ toolName, args, mode, isAsk = false }) => {
    const desc = getToolDescription(toolName);
    const actionText = isAsk ? desc.ask : desc.say;
    const mainArg = getToolMainArg(toolName, args);
    const toolColor = mode === "plan" ? "yellow" : COLORS.primaryBlue;
    return (React.createElement(Text, null,
        React.createElement(Text, { color: toolColor },
            "Cline ",
            actionText),
        mainArg && (React.createElement(Text, null,
            React.createElement(Text, { color: toolColor }, ": "),
            React.createElement(Text, null, mainArg)))));
};
/**
 * Truncate text with ellipsis
 */
function truncate(text, maxLength) {
    if (text.length <= maxLength)
        return text;
    return text.substring(0, maxLength - 3) + "...";
}
/**
 * Format tool result for display
 */
function formatToolResult(result, maxLines = 5) {
    const lines = result.split("\n");
    if (lines.length <= maxLines) {
        return lines;
    }
    const displayLines = lines.slice(0, maxLines);
    displayLines.push(`... ${lines.length - maxLines} more lines`);
    return displayLines;
}
export const ChatMessage = ({ message, mode, isStreaming }) => {
    const { type, ask, say, text, partial } = message;
    const toolColor = mode === "plan" ? "yellow" : COLORS.primaryBlue;
    const { columns: terminalWidth } = useTerminalSize();
    // User messages (task, user_feedback)
    // If multi-line, extend background to full width for consistent appearance
    if (say === "task" || say === "user_feedback") {
        const content = "> " + (text || "");
        const isMultiLine = content.includes("\n") || content.length > terminalWidth;
        if (isMultiLine) {
            return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
                React.createElement(Box, { backgroundColor: "blackBright", paddingX: 1, width: "100%" },
                    React.createElement(Text, { color: "white" }, content))));
        }
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1 },
            React.createElement(Box, { backgroundColor: "blackBright", paddingX: 1 },
                React.createElement(Text, { color: "white" }, content))));
    }
    // Assistant text response (hide reasoning traces - they're verbose and clutter the UI)
    if (say === "reasoning") {
        return null;
    }
    if (say === "text") {
        if (!text?.trim())
            return null;
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, null,
                React.createElement(MarkdownText, null, text))));
    }
    // Tool calls (ask) and tool results (say)
    const isToolAsk = type === "ask" && ask === "tool";
    const isToolSay = say === "tool";
    if ((isToolAsk || isToolSay) && text) {
        const toolInfo = parseToolFromMessage(text);
        if (toolInfo) {
            const filePath = toolInfo.args.path || toolInfo.args.file_path;
            // File edit tools - show diff
            if (isFileEditTool(toolInfo.toolName) && filePath && toolInfo.args.content) {
                return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
                    React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                        React.createElement(ToolCallText, { args: toolInfo.args, isAsk: isToolAsk, mode: mode, toolName: toolInfo.toolName })),
                    React.createElement(Box, { marginLeft: 2 },
                        React.createElement(DiffView, { content: toolInfo.args.content, filePath: filePath }))));
            }
            // Show result content for completed tools (both say and ask), or file path for pending asks
            const contentLines = toolInfo.result?.trim()
                ? formatToolResult(toolInfo.result, 5)
                : (isToolAsk || isToolSay) && filePath
                    ? [filePath]
                    : [];
            return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
                React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                    React.createElement(ToolCallText, { args: toolInfo.args, isAsk: isToolAsk, mode: mode, toolName: toolInfo.toolName })),
                contentLines.length > 0 && (React.createElement(Box, { flexDirection: "column", marginLeft: 2, width: "100%" }, contentLines.map((line, idx) => (React.createElement(ResultRow, { isFirst: idx === 0, key: idx },
                    React.createElement(Text, { color: "gray" }, line))))))));
        }
        // Fallback for unparseable tool messages
        if (isToolSay) {
            return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
                React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                    React.createElement(Text, { color: toolColor }, truncate(text, 100)))));
        }
    }
    // Command execution (ask or say) - now includes combined output
    if ((type === "ask" && ask === "command") || say === "command") {
        if (!text)
            return null;
        // Parse command and output from combined text
        const outputIndex = text.indexOf(COMMAND_OUTPUT_STRING);
        const command = outputIndex === -1 ? text : text.slice(0, outputIndex).trim();
        const output = outputIndex === -1 ? "" : text.slice(outputIndex + COMMAND_OUTPUT_STRING.length).trim();
        const isAsk = type === "ask";
        const label = isAsk ? "Cline wants to execute this command: " : "Cline executed this command: ";
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                React.createElement(Text, null,
                    React.createElement(Text, { color: toolColor }, label),
                    React.createElement(Text, null, truncate(command, 120)))),
            output && (React.createElement(Box, { flexDirection: "column", marginLeft: 2, width: "100%" }, formatToolResult(output, 8).map((line, idx) => (React.createElement(ResultRow, { isFirst: idx === 0, key: idx },
                React.createElement(Text, { color: "gray" }, line))))))));
    }
    // Command output - should not appear after combineCommandSequences, but handle as fallback
    if (say === "command_output" && text) {
        const lines = formatToolResult(text, 8);
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(Box, { flexDirection: "column", marginLeft: 2, width: "100%" }, lines.map((line, idx) => (React.createElement(ResultRow, { isFirst: idx === 0, key: idx },
                React.createElement(Text, { color: "gray" }, line)))))));
    }
    // MCP approval (ask) or acknowledgment (say)
    if ((type === "ask" && ask === "use_mcp_server") || say === "use_mcp_server") {
        const isAsk = type === "ask";
        const parsed = text
            ? jsonParseSafe(text, {
                type: undefined,
                serverName: "unknown server",
                toolName: undefined,
                arguments: undefined,
                uri: undefined,
            })
            : undefined;
        const serverName = parsed?.serverName || "unknown server";
        const actionLabel = isAsk ? "Cline wants to use MCP" : "Cline used MCP";
        const targetLine = parsed?.type === "access_mcp_resource"
            ? `resource: ${parsed?.uri || "unknown"}`
            : parsed?.type === "use_mcp_tool"
                ? `tool: ${parsed?.toolName || "unknown"}`
                : "tool: unknown";
        let argsLines = [];
        if (parsed?.arguments && parsed.arguments.trim() && parsed.arguments !== "{}") {
            let formattedArgs = parsed.arguments;
            try {
                formattedArgs = JSON.stringify(JSON.parse(parsed.arguments), null, 2);
            }
            catch {
                // Keep raw string if not valid JSON
            }
            argsLines = formatToolResult(formattedArgs, 10);
        }
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                React.createElement(Text, null,
                    React.createElement(Text, { color: toolColor }, actionLabel),
                    React.createElement(Text, null, `: ${serverName}`))),
            React.createElement(Box, { flexDirection: "column", marginLeft: 2, width: "100%" },
                React.createElement(ResultRow, { isFirst: true },
                    React.createElement(Text, { color: "gray" }, targetLine)),
                argsLines.length > 0 && (React.createElement(Box, { flexDirection: "column", paddingLeft: 3, width: "100%" },
                    React.createElement(Text, { color: "gray" }, "args:"),
                    argsLines.map((line, idx) => (React.createElement(Text, { color: "gray", key: `mcp-args-${idx}` }, line))))))));
    }
    if ((type === "ask" && ask === "use_subagents") || say === "use_subagents" || say === "subagent") {
        return React.createElement(SubagentMessage, { isStreaming: isStreaming, message: message, mode: mode });
    }
    // MCP response
    if (say === "mcp_server_response" && text) {
        const lines = formatToolResult(text, 8);
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                React.createElement(Text, { color: toolColor }, "MCP response")),
            React.createElement(Box, { flexDirection: "column", marginLeft: 2, width: "100%" }, lines.map((line, idx) => (React.createElement(ResultRow, { isFirst: idx === 0, key: idx },
                React.createElement(Text, { color: "gray" }, line)))))));
    }
    // Error messages
    if (say === "clineignore_error") {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: "red" },
                React.createElement(Text, { color: "red", wrap: "wrap" },
                    "Cline tried to access ",
                    React.createElement(Text, { bold: true }, text),
                    " which is blocked by the .clineignore file."))));
    }
    if (say === "error" || (type === "ask" && ask === "api_req_failed")) {
        // Try to parse error message if it's JSON
        let errorMessage = text || "Unknown error";
        if (text) {
            const parsed = jsonParseSafe(text, { message: undefined });
            if (parsed.message) {
                errorMessage = parsed.message;
            }
        }
        // Check for Cline auth error to show sign-in instructions
        const isClineAuthError = errorMessage.includes(CLINE_ACCOUNT_AUTH_ERROR_MESSAGE);
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: "red" },
                React.createElement(Text, { color: "red", wrap: "wrap" },
                    React.createElement(Text, { bold: true }, "Error"),
                    ": ",
                    errorMessage)),
            isClineAuthError && (React.createElement(Box, { marginLeft: 2, marginTop: 1 },
                React.createElement(Text, { color: "gray" },
                    "Run ",
                    React.createElement(Text, { color: "cyan" }, "/settings"),
                    " and go to Account to sign in.")))));
    }
    // Error retry messages
    if (say === "error_retry" && text) {
        const retryInfo = jsonParseSafe(text, {
            failed: false,
            attempt: 0,
            maxAttempts: 3,
            errorMessage: undefined,
        });
        // Parse nested errorMessage if it's a JSON string
        let errorMsg = "Request failed";
        if (retryInfo.errorMessage) {
            try {
                const errorObj = jsonParseSafe(retryInfo.errorMessage, { message: undefined });
                errorMsg = errorObj.message || retryInfo.errorMessage;
            }
            catch {
                errorMsg = retryInfo.errorMessage;
            }
        }
        if (retryInfo.failed) {
            return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
                React.createElement(DotRow, { color: "red" },
                    React.createElement(Text, { bold: true, color: "red" }, "Failed"),
                    React.createElement(Text, { color: "red" },
                        " after ",
                        retryInfo.maxAttempts,
                        " retries")),
                React.createElement(Box, { marginLeft: 2 },
                    React.createElement(Text, { color: "red", dimColor: true }, errorMsg))));
        }
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: "yellow" },
                React.createElement(Text, { bold: true, color: "yellow" }, "Retrying"),
                React.createElement(Text, { color: "yellow" },
                    "... (attempt ",
                    retryInfo.attempt,
                    "/",
                    retryInfo.maxAttempts,
                    ")")),
            React.createElement(Box, { marginLeft: 2 },
                React.createElement(Text, { color: "yellow", dimColor: true }, errorMsg))));
    }
    // Completion result
    // Only render ask: "completion_result" if it has text - the empty ask is just for UI confirmation
    if (say === "completion_result" || (type === "ask" && ask === "completion_result" && text)) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: "green" },
                React.createElement(Text, { color: "green" }, "Task completed")),
            text && (React.createElement(Box, { marginLeft: 2 },
                React.createElement(MarkdownText, { color: "greenBright" }, text)))));
    }
    // API request info (show cost/tokens inline)
    if (say === "api_req_started" && text) {
        // Skip showing these - they're summarized in the status bar
        return null;
    }
    // Browser actions
    if (say === "browser_action" || say === "browser_action_launch") {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                React.createElement(Text, null,
                    React.createElement(Text, { color: toolColor }, "Cline used the browser"),
                    text && (React.createElement(Text, null,
                        React.createElement(Text, { color: toolColor }, ": "),
                        React.createElement(Text, null, truncate(text, 50))))))));
    }
    // MCP server
    if (say === "mcp_server_request_started") {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor, flashing: partial === true && isStreaming },
                React.createElement(Text, null,
                    React.createElement(Text, { color: toolColor }, "Cline is using an MCP tool"),
                    text && (React.createElement(Text, null,
                        React.createElement(Text, { color: toolColor }, ": "),
                        React.createElement(Text, null, truncate(text, 50))))))));
    }
    // MCP notifications
    if (say === "mcp_notification" && text) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor },
                React.createElement(Text, null,
                    React.createElement(Text, { color: toolColor }, "MCP Notification"),
                    React.createElement(Text, null,
                        ": ",
                        truncate(text, 120))))));
    }
    // Info messages
    if (say === "info") {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: "gray" },
                React.createElement(Text, { color: "gray" }, text))));
    }
    // Followup questions from assistant
    if (type === "ask" && ask === "followup" && text) {
        const parsed = jsonParseSafe(text, {
            question: undefined,
            options: undefined,
            selected: undefined,
        });
        if (parsed.question) {
            return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
                React.createElement(DotRow, null,
                    React.createElement(MarkdownText, null, parsed.question)),
                parsed.options && parsed.options.length > 0 && (React.createElement(Box, { flexDirection: "column", paddingLeft: 2 }, parsed.options.map((opt, idx) => {
                    const isSelected = parsed.selected === opt;
                    return (React.createElement(Text, { color: isSelected ? "green" : toolColor, key: opt },
                        isSelected ? "✓" : `${idx + 1}.`,
                        " ",
                        opt));
                })))));
        }
    }
    // Act mode response (non-blocking progress update)
    if (type === "ask" && ask === "act_mode_respond" && text) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: toolColor },
                React.createElement(MarkdownText, { color: toolColor }, text))));
    }
    // Plan mode response
    if (type === "ask" && ask === "plan_mode_respond" && text) {
        const parsed = jsonParseSafe(text, { response: undefined });
        if (parsed.response) {
            return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
                React.createElement(DotRow, { color: "yellow" },
                    React.createElement(MarkdownText, { color: "yellow" }, parsed.response))));
        }
    }
    // Mistake limit reached (ask)
    if (type === "ask" && ask === "mistake_limit_reached") {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: "red" },
                React.createElement(Text, { color: "red", wrap: "wrap" },
                    React.createElement(Text, { bold: true }, "Error"),
                    ": ",
                    text || "Mistake limit reached."))));
    }
    // New task request from assistant
    if (type === "ask" && ask === "new_task" && text) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: COLORS.primaryBlue },
                React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, "Cline wants to start a new task:")),
            React.createElement(Box, { flexDirection: "column", paddingLeft: 2 },
                React.createElement(Text, { color: "gray" }, text))));
    }
    // Condense conversation request
    if (type === "ask" && ask === "condense" && text) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: COLORS.primaryBlue, flashing: partial === true && isStreaming },
                React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, "Cline wants to condense your conversation:")),
            React.createElement(Box, { flexDirection: "column", paddingLeft: 2 },
                React.createElement(Text, { color: "gray" }, text))));
    }
    // Summarize task request
    if (type === "ask" && ask === "summarize_task" && text) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: COLORS.primaryBlue, flashing: partial === true && isStreaming },
                React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, "Cline wants to summarize the task:")),
            React.createElement(Box, { flexDirection: "column", paddingLeft: 2 },
                React.createElement(Text, { color: "gray" }, text))));
    }
    // Report bug request
    if (type === "ask" && ask === "report_bug" && text) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, width: "100%" },
            React.createElement(DotRow, { color: COLORS.primaryBlue, flashing: partial === true && isStreaming },
                React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, "Cline wants to create a Github issue:")),
            React.createElement(Box, { flexDirection: "column", paddingLeft: 2 },
                React.createElement(Text, { color: "gray" }, text))));
    }
    // Skip other message types
    return null;
};
export const ChatMessageList = ({ messages, maxMessages }) => {
    // Filter out messages we don't want to display
    const displayMessages = messages.filter((m) => {
        // Skip api_req_finished, they're just markers
        if (m.say === "api_req_finished")
            return false;
        // Skip hidden aggregated usage messages
        if (m.say === "subagent_usage")
            return false;
        // Skip empty text messages
        if (m.say === "text" && !m.text?.trim())
            return false;
        // Skip checkpoint messages
        if (m.say === "checkpoint_created")
            return false;
        return true;
    });
    // Optionally limit number of messages shown
    const messagesToShow = maxMessages ? displayMessages.slice(-maxMessages) : displayMessages;
    // Check if last message is streaming
    const lastMessage = messagesToShow[messagesToShow.length - 1];
    const isLastStreaming = lastMessage?.partial === true;
    return (React.createElement(Box, { flexDirection: "column" }, messagesToShow.map((msg, idx) => (React.createElement(ChatMessage, { isStreaming: idx === messagesToShow.length - 1 && isLastStreaming, key: msg.ts, message: msg })))));
};
//# sourceMappingURL=ChatMessage.js.map