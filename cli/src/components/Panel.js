/**
 * Reusable bottom panel component
 * Used for displaying contextual UI below the chat input (settings, etc.)
 */
import { Box, Text } from "ink";
import React from "react";
import { COLORS } from "../constants/colors";
import { useTerminalSize } from "../hooks/useTerminalSize";
export const Panel = ({ label, tabs, currentTab, isSubpage, children }) => {
    const { columns } = useTerminalSize();
    const currentTabIndex = currentTab && tabs ? tabs.findIndex((t) => t.key === currentTab) : 0;
    return (React.createElement(Box, { borderColor: COLORS.primaryBlue, borderStyle: "round", flexDirection: "column", width: "100%" },
        React.createElement(Box, { paddingLeft: 1, paddingRight: 1 },
            React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, label),
            React.createElement(Text, { color: "gray" },
                " (Esc to ",
                isSubpage ? "go back" : "close",
                ")")),
        tabs && tabs.length > 0 && (React.createElement(Box, { paddingLeft: 1, paddingRight: 1 },
            tabs.map((tab, idx) => {
                const isActive = idx === currentTabIndex;
                return (React.createElement(Text, { bold: isActive, color: isActive ? COLORS.primaryBlue : "white", inverse: isActive, key: tab.key }, ` ${tab.label} `));
            }),
            !isSubpage && React.createElement(Text, { color: "gray" }, " (\u2190/\u2192)"))),
        React.createElement(Box, null,
            React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, "─".repeat(Math.max(columns - 2, 0)))),
        React.createElement(Box, { flexDirection: "column", paddingLeft: 1, paddingRight: 1 }, children)));
};
//# sourceMappingURL=Panel.js.map