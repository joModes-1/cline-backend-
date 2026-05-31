/**
 * Reusable API key input component
 * Shows a password-masked input field for entering API keys
 */
import { Box, Text, useInput } from "ink";
import React from "react";
import { COLORS } from "../constants/colors";
import { useStdinContext } from "../context/StdinContext";
import { isEnterKey, isMouseEscapeSequence } from "../utils/input";
export const ApiKeyInput = ({ providerName, value, onChange, onSubmit, onCancel, isActive = true, }) => {
    const { isRawModeSupported } = useStdinContext();
    useInput((input, key) => {
        // Filter out mouse escape sequences
        if (isMouseEscapeSequence(input)) {
            return;
        }
        if (key.escape) {
            onCancel();
            return;
        }
        if (isEnterKey(input, key)) {
            onSubmit(value);
            return;
        }
        if (key.backspace || key.delete) {
            onChange(value.slice(0, -1));
            return;
        }
        if (input && !key.ctrl && !key.meta) {
            onChange(value + input);
        }
    }, { isActive: isRawModeSupported && isActive });
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Text, { bold: true, color: COLORS.primaryBlue },
            providerName,
            " API Key"),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { color: "gray" }, "Paste your API key below")),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { color: "white" }, "•".repeat(value.length)),
            React.createElement(Text, { inverse: true }, " ")),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { color: "gray" }, "Enter to save, Esc to cancel"))));
};
//# sourceMappingURL=ApiKeyInput.js.map