/**
 * User input prompt component
 * Handles different types of user interactions (text input, confirmations, choices)
 */
import { Box, Text, useApp, useInput } from "ink";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useStdinContext } from "../context/StdinContext";
import { useTaskController } from "../context/TaskContext";
import { useLastCompletedAskMessage } from "../hooks/useStateSubscriber";
import { isEnterKey, isMouseEscapeSequence } from "../utils/input";
import { jsonParseSafe } from "../utils/parser";
function getPromptType(ask, text) {
    switch (ask) {
        case "followup": {
            const parts = jsonParseSafe(text, {
                question: undefined,
                options: undefined,
            });
            if (parts.options && parts.options.length > 0) {
                return "options";
            }
            return "text";
        }
        case "plan_mode_respond": {
            const parts = jsonParseSafe(text, {
                question: undefined,
                options: undefined,
            });
            if (parts.options && parts.options.length > 0) {
                return "options";
            }
            // Plan mode without options - allow text input or toggle to Act mode
            return "plan_mode_text";
        }
        case "completion_result":
            // Task completed - allow follow-up question or exit
            return "completion";
        case "resume_task":
        case "resume_completed_task":
            return "exit_confirmation";
        case "command":
        case "tool":
        case "browser_action_launch":
        case "use_mcp_server":
            return "confirmation";
        default:
            return "none";
    }
}
export const AskPrompt = ({ onRespond }) => {
    const { exit } = useApp();
    const { isRawModeSupported } = useStdinContext();
    const controller = useTaskController();
    const lastAskMessage = useLastCompletedAskMessage();
    const [textInput, setTextInput] = useState("");
    const [responded, setResponded] = useState(false);
    const lastAskTs = useRef(null);
    // Reset state when ask message changes
    useEffect(() => {
        if (lastAskMessage && lastAskMessage.ts !== lastAskTs.current) {
            lastAskTs.current = lastAskMessage.ts;
            setTextInput("");
            setResponded(false);
        }
    }, [lastAskMessage]);
    const sendResponse = useCallback(async (responseType, text) => {
        if (responded || !controller?.task) {
            return;
        }
        setResponded(true);
        try {
            await controller.task.handleWebviewAskResponse(responseType, text);
            onRespond?.(text || responseType);
        }
        catch {
            // Controller may be disposed
        }
    }, [controller, responded, onRespond]);
    const toggleToActMode = useCallback(async () => {
        if (responded || !controller) {
            return;
        }
        setResponded(true);
        try {
            await controller.togglePlanActMode("act");
            onRespond?.("Switched to Act mode");
        }
        catch {
            // Controller may be disposed
        }
    }, [controller, responded, onRespond]);
    // Handle keyboard input
    useInput((input, key) => {
        // Filter out mouse escape sequences
        if (isMouseEscapeSequence(input)) {
            return;
        }
        if (!lastAskMessage || responded) {
            return;
        }
        const ask = lastAskMessage.ask;
        const text = lastAskMessage.text || "";
        const promptType = getPromptType(ask, text);
        if (promptType === "confirmation" || promptType === "exit_confirmation") {
            // y/n confirmation
            if (input.toLowerCase() === "y") {
                sendResponse("yesButtonClicked");
            }
            else if (input.toLowerCase() === "n") {
                if (promptType === "exit_confirmation") {
                    exit();
                    return;
                }
                sendResponse("noButtonClicked");
            }
        }
        else if (promptType === "options") {
            // Number selection for options, or free text input
            const parts = jsonParseSafe(text, { options: [] });
            if (isEnterKey(input, key)) {
                // Submit free text on Enter
                if (textInput.trim()) {
                    sendResponse("messageResponse", textInput.trim());
                }
            }
            else if (key.backspace || key.delete) {
                setTextInput((prev) => prev.slice(0, -1));
            }
            else if (input && !key.ctrl && !key.meta) {
                // Check if it's a number for option selection (only when no text typed yet)
                const num = Number.parseInt(input, 10);
                if (textInput === "" && !Number.isNaN(num) && num >= 1 && num <= parts.options.length) {
                    const selectedOption = parts.options[num - 1];
                    sendResponse("messageResponse", selectedOption);
                }
                else {
                    // Regular character input for free text
                    setTextInput((prev) => prev + input);
                }
            }
        }
        else if (promptType === "text") {
            // Text input mode
            if (isEnterKey(input, key)) {
                // Submit on Enter
                if (textInput.trim()) {
                    sendResponse("messageResponse", textInput.trim());
                }
            }
            else if (key.backspace || key.delete) {
                setTextInput((prev) => prev.slice(0, -1));
            }
            else if (input && !key.ctrl && !key.meta) {
                // Regular character input
                setTextInput((prev) => prev + input);
            }
        }
        else if (promptType === "plan_mode_text") {
            // Plan mode text input - allows text response or toggle to Act mode
            if (isEnterKey(input, key)) {
                // Submit on Enter
                if (textInput.trim()) {
                    sendResponse("messageResponse", textInput.trim());
                }
                else {
                    // Empty enter = switch to Act mode
                    toggleToActMode();
                }
            }
            else if (key.backspace || key.delete) {
                setTextInput((prev) => prev.slice(0, -1));
            }
            else if (input && !key.ctrl && !key.meta) {
                // Regular character input
                setTextInput((prev) => prev + input);
            }
        }
        else if (promptType === "completion") {
            // Task completed - allow follow-up question or exit
            if (isEnterKey(input, key)) {
                if (textInput.trim()) {
                    // Send follow-up question
                    sendResponse("messageResponse", textInput.trim());
                }
                else {
                    // Empty enter = confirm completion (exit)
                    sendResponse("yesButtonClicked");
                }
            }
            else if (key.backspace || key.delete) {
                setTextInput((prev) => prev.slice(0, -1));
            }
            else if (input && !key.ctrl && !key.meta) {
                // Regular character input
                setTextInput((prev) => prev + input);
            }
        }
    }, { isActive: isRawModeSupported && !!lastAskMessage && !responded });
    if (!lastAskMessage || responded) {
        return null;
    }
    const ask = lastAskMessage.ask;
    const text = lastAskMessage.text || "";
    const promptType = getPromptType(ask, text);
    const icon = getCliMessagePrefixIcon(lastAskMessage);
    if (promptType === "none") {
        return null;
    }
    switch (ask) {
        case "followup": {
            const parts = jsonParseSafe(text, {
                question: undefined,
                options: undefined,
            });
            if (parts.options && parts.options.length > 0) {
                return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                    React.createElement(Text, { color: "cyan" }, "Select an option (enter number):"),
                    parts.options.map((opt, idx) => (React.createElement(Box, { key: idx, marginLeft: 2 },
                        React.createElement(Text, null, `${idx + 1}. ${opt}`)))),
                    React.createElement(Box, { marginTop: 1 },
                        React.createElement(Text, null,
                            icon,
                            " "),
                        React.createElement(Text, { color: "cyan" }, "Or type: "),
                        React.createElement(Text, null, textInput),
                        React.createElement(Text, { inverse: true }, " ")),
                    React.createElement(Text, { color: "gray" }, "(Enter number to select, or type response + Enter)")));
            }
            // Text input prompt
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, null,
                        icon,
                        " "),
                    React.createElement(Text, { color: "cyan" }, "Reply: "),
                    React.createElement(Text, null, textInput),
                    React.createElement(Text, { inverse: true }, " ")),
                React.createElement(Text, { color: "gray" }, "(Type your response and press Enter)")));
        }
        case "plan_mode_respond": {
            const parts = jsonParseSafe(text, {
                question: undefined,
                options: undefined,
            });
            if (parts.options && parts.options.length > 0) {
                return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                    React.createElement(Text, { color: "cyan" }, "Select an option (enter number):"),
                    parts.options.map((opt, idx) => (React.createElement(Box, { key: idx, marginLeft: 2 },
                        React.createElement(Text, null, `${idx + 1}. ${opt}`)))),
                    React.createElement(Box, { marginTop: 1 },
                        React.createElement(Text, null,
                            icon,
                            " "),
                        React.createElement(Text, { color: "cyan" }, "Or type: "),
                        React.createElement(Text, null, textInput),
                        React.createElement(Text, { inverse: true }, " ")),
                    React.createElement(Text, { color: "gray" }, "(Enter number to select, or type response + Enter)")));
            }
            // Plan mode text input - show option to switch to Act mode
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, null,
                        icon,
                        " "),
                    React.createElement(Text, { color: "cyan" }, "Reply: "),
                    React.createElement(Text, null, textInput),
                    React.createElement(Text, { inverse: true }, " ")),
                React.createElement(Text, { color: "gray" }, "(Type response + Enter, or just Enter to switch to Act mode)")));
        }
        case "command":
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, null,
                        icon,
                        " "),
                    React.createElement(Text, { color: "yellow" }, " Execute this command? "),
                    React.createElement(Text, { color: "gray" }, "(y/n)"))));
        case "tool":
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, null,
                        icon,
                        " "),
                    React.createElement(Text, { color: "blue" }, " Use this tool? "),
                    React.createElement(Text, { color: "gray" }, "(y/n)"))));
        case "completion_result":
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, null,
                        icon,
                        " "),
                    React.createElement(Text, { color: "cyan" }, "Follow-up: "),
                    React.createElement(Text, null, textInput),
                    React.createElement(Text, { inverse: true }, " ")),
                React.createElement(Text, { color: "gray" }, "(Type follow-up question + Enter, or q to exit)")));
        case "resume_task":
        case "resume_completed_task":
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, null,
                        icon,
                        " "),
                    React.createElement(Text, { color: "cyan" }, " Resume task? "),
                    React.createElement(Text, { color: "gray" }, "(y/n)"))));
        case "browser_action_launch":
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, null,
                        icon,
                        " "),
                    React.createElement(Text, { color: "cyan" }, " Launch browser? "),
                    React.createElement(Text, { color: "gray" }, "(y/n)"))));
        case "use_mcp_server":
            return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, null,
                        icon,
                        " "),
                    React.createElement(Text, { color: "cyan" }, " Use MCP server? "),
                    React.createElement(Text, { color: "gray" }, "(y/n)"))));
        default:
            return null;
    }
};
/**
 * Get emoji icon for message type
 */
function getCliMessagePrefixIcon(message) {
    if (message.type === "ask") {
        switch (message.ask) {
            case "followup":
                return "❓";
            case "command":
            case "command_output":
                return "⚙️";
            case "tool":
                return "🔧";
            case "completion_result":
                return "✅";
            case "api_req_failed":
                return "❌";
            case "resume_task":
            case "resume_completed_task":
                return "▶️";
            case "browser_action_launch":
                return "🌐";
            case "use_mcp_server":
                return "🔌";
            case "plan_mode_respond":
                return "📋";
            default:
                return "❔";
        }
    }
    switch (message.say) {
        case "task":
            return "📋";
        case "error":
            return "❌";
        case "text":
            return "💬";
        case "reasoning":
            return "🧠";
        case "completion_result":
            return "✅";
        case "user_feedback":
            return "👤";
        case "command":
        case "command_output":
            return "⚙️";
        case "tool":
            return "🔧";
        case "browser_action":
        case "browser_action_launch":
        case "browser_action_result":
            return "🌐";
        case "mcp_server_request_started":
        case "mcp_server_response":
            return "🔌";
        case "api_req_started":
        case "api_req_finished":
            return "🔄";
        case "checkpoint_created":
            return "💾";
        case "info":
            return "ℹ️";
        case "generate_explanation":
            return "📝";
        default:
            return "  ";
    }
}
//# sourceMappingURL=AskPrompt.js.map