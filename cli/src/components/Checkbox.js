/**
 * Reusable Checkbox component for settings panels
 */
import { Box, Text } from "ink";
import React from "react";
import { COLORS } from "../constants/colors";
export const Checkbox = ({ label, checked, isSelected = false, description }) => {
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Text, null,
            React.createElement(Text, { bold: true, color: isSelected ? COLORS.primaryBlue : undefined },
                isSelected ? "❯" : " ",
                " "),
            React.createElement(Text, { color: isSelected || checked ? COLORS.primaryBlue : "gray" }, checked ? "[✓]" : "[ ]"),
            React.createElement(Text, { color: isSelected ? COLORS.primaryBlue : "white" },
                " ",
                label),
            isSelected && React.createElement(Text, { color: "gray" }, " (Tab to toggle)")),
        description && (React.createElement(Box, { marginLeft: 6 },
            React.createElement(Text, { color: "gray" }, description)))));
};
//# sourceMappingURL=Checkbox.js.map