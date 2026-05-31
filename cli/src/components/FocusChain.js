/**
 * Focus Chain / To-Do List component for CLI
 * Displays a progress-tracked checklist of tasks
 */
import { isCompletedFocusChainItem, isFocusChainItem, parseFocusChainItem } from "@shared/focus-chain-utils";
import { Box, Text } from "ink";
import React, { useMemo } from "react";
/**
 * Parse the focus chain checklist text into TodoInfo
 */
function parseCurrentTodoInfo(text) {
    if (!text) {
        return null;
    }
    let completedCount = 0;
    let totalCount = 0;
    let firstIncompleteIndex = -1;
    let firstIncompleteText = null;
    const lines = text.split("\n");
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (isFocusChainItem(line)) {
            const isCompleted = isCompletedFocusChainItem(line);
            if (isCompleted) {
                completedCount++;
            }
            else if (firstIncompleteIndex === -1) {
                firstIncompleteIndex = totalCount;
                // Extract text after "- [ ] "
                firstIncompleteText = line.substring(5).trim();
            }
            totalCount++;
        }
    }
    if (totalCount === 0) {
        return null;
    }
    const currentTodo = firstIncompleteText ? { text: firstIncompleteText, completed: false, index: firstIncompleteIndex } : null;
    return {
        currentTodo,
        currentIndex: firstIncompleteIndex >= 0 ? firstIncompleteIndex + 1 : totalCount,
        completedCount,
        totalCount,
        progressPercentage: (completedCount / totalCount) * 100,
    };
}
/**
 * Parse all todo items from the checklist
 */
function parseTodoItems(text) {
    const items = [];
    const lines = text.split("\n");
    for (const rawLine of lines) {
        const line = rawLine.trim();
        const parsed = parseFocusChainItem(line);
        if (parsed) {
            items.push(parsed);
        }
    }
    return items;
}
/**
 * Render progress bar
 */
const ProgressBar = ({ percentage, width = 20 }) => {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const bar = "█".repeat(filled) + "░".repeat(empty);
    return (React.createElement(Text, null,
        React.createElement(Text, { color: "green" }, bar),
        React.createElement(Text, { dimColor: true },
            " ",
            Math.round(percentage),
            "%")));
};
/**
 * Header view showing current task and progress
 */
const Header = ({ todoInfo }) => {
    const { currentTodo, currentIndex, totalCount, completedCount } = todoInfo;
    const isCompleted = completedCount === totalCount;
    const displayText = isCompleted ? "All tasks completed!" : currentTodo?.text || "To-Do list";
    const truncatedText = displayText.length > 50 ? displayText.substring(0, 47) + "..." : displayText;
    return (React.createElement(Box, { flexDirection: "row", gap: 1 },
        React.createElement(Text, { color: isCompleted ? "green" : "cyan" },
            "[",
            currentIndex,
            "/",
            totalCount,
            "]"),
        React.createElement(Text, { color: isCompleted ? "green" : undefined }, truncatedText)));
};
/**
 * Expanded view showing all todo items
 */
const ExpandedList = ({ items, isCompleted }) => {
    return (React.createElement(Box, { flexDirection: "column", marginLeft: 2, marginTop: 1 },
        items.map((item, index) => (React.createElement(Box, { key: index },
            React.createElement(Text, { color: item.checked ? "green" : "gray" },
                item.checked ? "✓" : "○",
                " "),
            React.createElement(Text, { color: item.checked ? "green" : undefined, dimColor: item.checked }, item.text)))),
        isCompleted && (React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true, italic: true }, "New steps will be generated if you continue the task")))));
};
/**
 * Main FocusChain component for CLI
 * Shows a progress summary of the current to-do list
 * Use expanded={true} to show all items (e.g., in verbose mode)
 */
export const FocusChain = ({ focusChainChecklist, expanded = false }) => {
    const todoInfo = useMemo(() => (focusChainChecklist ? parseCurrentTodoInfo(focusChainChecklist) : null), [focusChainChecklist]);
    const todoItems = useMemo(() => (focusChainChecklist ? parseTodoItems(focusChainChecklist) : []), [focusChainChecklist]);
    // No content to display
    if (!todoInfo) {
        return null;
    }
    const isCompleted = todoInfo.completedCount === todoInfo.totalCount;
    return (React.createElement(Box, { borderColor: isCompleted ? "green" : "gray", borderStyle: "round", flexDirection: "column", paddingX: 1 },
        React.createElement(Header, { todoInfo: todoInfo }),
        React.createElement(ProgressBar, { percentage: todoInfo.progressPercentage }),
        expanded && React.createElement(ExpandedList, { isCompleted: isCompleted, items: todoItems })));
};
//# sourceMappingURL=FocusChain.js.map