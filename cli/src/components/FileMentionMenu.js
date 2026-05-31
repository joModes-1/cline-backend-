/**
 * File mention menu component for CLI
 * Displays a list of matching files when user types @
 */
import { Box, Text } from "ink";
import React from "react";
import { COLORS } from "../constants/colors";
import { getRipgrepInstallInstructions } from "../utils/file-search";
import { getVisibleWindow } from "../utils/slash-commands";
/**
 * Truncate path from the left if too long, keeping the filename visible
 */
function truncatePath(filePath, maxLength = 50) {
    if (filePath.length <= maxLength) {
        return filePath;
    }
    return "..." + filePath.slice(-(maxLength - 3));
}
export const FileMentionMenu = ({ results, selectedIndex, isLoading, query, showRipgrepWarning, }) => {
    const ripgrepWarning = showRipgrepWarning && (React.createElement(Box, { marginTop: 1 },
        React.createElement(Text, { color: "yellow" }, "ripgrep not found - file search will be slower. "),
        React.createElement(Text, { color: "gray" },
            "Install: ",
            getRipgrepInstallInstructions())));
    if (isLoading) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, paddingLeft: 1, paddingRight: 1 },
            React.createElement(Text, { color: "gray" }, "Searching files..."),
            ripgrepWarning));
    }
    if (results.length === 0) {
        return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, paddingLeft: 1, paddingRight: 1 },
            React.createElement(Text, { color: "gray" }, query ? `No files matching "${query}"` : "Type to search files..."),
            ripgrepWarning));
    }
    const { items: visibleResults, startIndex } = getVisibleWindow(results, selectedIndex);
    const hasMoreBelow = startIndex + visibleResults.length < results.length;
    return (React.createElement(Box, { flexDirection: "column", marginBottom: 1, paddingLeft: 1, paddingRight: 1 },
        visibleResults.map((result, idx) => {
            const isSelected = startIndex + idx === selectedIndex;
            const displayPath = truncatePath(result.path);
            return (React.createElement(Box, { key: result.path },
                React.createElement(Text, { color: isSelected ? COLORS.primaryBlue : undefined },
                    isSelected ? "❯" : " ",
                    " ",
                    displayPath)));
        }),
        hasMoreBelow && React.createElement(Text, { color: "gray" },
            "  ",
            "\u25BC"),
        ripgrepWarning));
};
//# sourceMappingURL=FileMentionMenu.js.map