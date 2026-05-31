/**
 * Help panel content for inline display in ChatView
 * Explains Cline CLI features and links to documentation
 */
import { Box, Text, useInput } from "ink";
import React from "react";
import { COLORS } from "../constants/colors";
import { useStdinContext } from "../context/StdinContext";
import { isMouseEscapeSequence } from "../utils/input";
import { Panel } from "./Panel";
export const HelpPanelContent = ({ onClose }) => {
    const { isRawModeSupported } = useStdinContext();
    useInput((input, key) => {
        if (isMouseEscapeSequence(input)) {
            return;
        }
        if (key.escape) {
            onClose();
        }
    }, { isActive: isRawModeSupported });
    return (React.createElement(Panel, { label: "Help" },
        React.createElement(Box, { flexDirection: "column", gap: 1 },
            React.createElement(Text, null, "Cline can edit files, run terminal commands, use the browser, and more with your permission."),
            React.createElement(Box, { flexDirection: "column" },
                React.createElement(Text, { bold: true }, "Plan vs Act Mode"),
                React.createElement(Text, null,
                    "Use ",
                    React.createElement(Text, { color: "yellow" }, "Plan"),
                    " mode to discuss and strategize before making changes. Use",
                    " ",
                    React.createElement(Text, { color: COLORS.primaryBlue }, "Act"),
                    " mode when you're ready for Cline to edit files and run commands. Toggle between them with ",
                    React.createElement(Text, { color: "white" }, "Tab"),
                    ".")),
            React.createElement(Box, { flexDirection: "column" },
                React.createElement(Text, { bold: true }, "Keyboard Shortcuts"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "Ctrl+U"),
                    " - Clear entire input (delete to start)"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "Ctrl+K"),
                    " - Delete from cursor to end"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "Ctrl+W"),
                    " - Delete word backwards"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "Ctrl+A / Ctrl+E"),
                    " - Jump to start / end of input"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "Alt/Option+\u2190/\u2192"),
                    " - Move by word")),
            React.createElement(Box, { flexDirection: "column" },
                React.createElement(Text, { bold: true }, "Slash Commands"),
                React.createElement(Text, null,
                    "Type ",
                    React.createElement(Text, { color: "white" }, "/"),
                    " to see available commands. Key ones include:"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "/settings"),
                    " - Configure your API provider and preferences"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "/models"),
                    " - Switch AI models"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "/history"),
                    " - Browse previous tasks"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "/clear"),
                    " - Start a fresh task"),
                React.createElement(Text, null,
                    "  ",
                    React.createElement(Text, { color: "white" }, "/q"),
                    " - Quit Cline")),
            React.createElement(Text, null,
                "For more help: ",
                React.createElement(Text, { color: COLORS.primaryBlue }, "https://docs.cline.bot/cline-cli")))));
};
//# sourceMappingURL=HelpPanelContent.js.map