/**
 * History view component
 * Displays task history with keyboard navigation
 */
import { Box, Text, useInput } from "ink";
import React, { useCallback, useState } from "react";
import { showTaskWithId } from "@/core/controller/task/showTaskWithId";
import { StringRequest } from "@/shared/proto/cline/common";
import { useStdinContext } from "../context/StdinContext";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { isEnterKey } from "../utils/input";
/**
 * Format separator
 */
function formatSeparator(char = "─", width = 80) {
    return char.repeat(Math.max(width, 10));
}
export const HistoryView = ({ items, visibleCount, controller, onSelectTask, pagination, onPageChange, allItems, }) => {
    const { isRawModeSupported } = useStdinContext();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [internalPage, setInternalPage] = useState(pagination?.page ?? 1);
    const { rows: terminalRows } = useTerminalSize();
    // Calculate visible count based on terminal height to prevent overflow
    // Each item takes ~5 lines (date, id, task text, cost/model, margin)
    // Reserve lines for header (title, hint, pagination, separator) and footer (separator)
    const headerLines = (pagination?.totalPages ?? 1) > 1 ? 5 : 4;
    const footerLines = 1;
    const availableRows = terminalRows - headerLines - footerLines;
    const itemHeight = 5;
    const dynamicVisibleCount = Math.max(1, Math.floor(availableRows / itemHeight));
    const effectiveVisibleCount = visibleCount ?? dynamicVisibleCount;
    const onSelect = useCallback((item) => {
        // Load the task via controller, then notify parent to switch views
        showTaskWithId(controller, StringRequest.create({ value: item.id }))
            .then(() => {
            onSelectTask?.(item.id);
        })
            .catch((error) => console.error("Error showing task:", error));
    }, [controller, onSelectTask]);
    // Use internal pagination if allItems is provided, otherwise use external
    const useInternalPagination = !!allItems;
    const limit = pagination?.limit ?? 10;
    const totalCount = allItems?.length ?? pagination?.totalCount ?? items.length;
    const totalPages = useInternalPagination ? Math.ceil(totalCount / limit) : (pagination?.totalPages ?? 1);
    const currentPage = useInternalPagination ? internalPage : (pagination?.page ?? 1);
    const hasPrevPage = currentPage > 1;
    const hasNextPage = currentPage < totalPages;
    // Get current page items
    const pageItems = useInternalPagination ? (allItems ?? []).slice((currentPage - 1) * limit, currentPage * limit) : items;
    const handlePageChange = useCallback((newPage) => {
        if (useInternalPagination) {
            setInternalPage(newPage);
            setSelectedIndex(0);
        }
        else if (onPageChange) {
            onPageChange(newPage);
            setSelectedIndex(0);
        }
    }, [useInternalPagination, onPageChange]);
    useInput((input, key) => {
        if (key.upArrow || input === "k") {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
        }
        else if (key.downArrow || input === "j") {
            setSelectedIndex((prev) => Math.min(pageItems.length - 1, prev + 1));
        }
        else if (isEnterKey(input, key) && pageItems[selectedIndex]) {
            onSelect(pageItems[selectedIndex]);
        }
        else if (key.leftArrow && hasPrevPage) {
            handlePageChange(currentPage - 1);
        }
        else if (key.rightArrow && hasNextPage) {
            handlePageChange(currentPage + 1);
        }
        else if (input === "n" && hasNextPage) {
            handlePageChange(currentPage + 1);
        }
        else if (input === "p" && hasPrevPage) {
            handlePageChange(currentPage - 1);
        }
    }, { isActive: isRawModeSupported });
    // Calculate visible window around selected item
    const halfVisible = Math.floor(effectiveVisibleCount / 2);
    let startIndex = Math.max(0, selectedIndex - halfVisible);
    const endIndex = Math.min(pageItems.length, startIndex + effectiveVisibleCount);
    // Adjust start if we're near the end
    if (endIndex - startIndex < effectiveVisibleCount) {
        startIndex = Math.max(0, endIndex - effectiveVisibleCount);
    }
    const visibleTasks = pageItems.slice(startIndex, endIndex);
    const showUpIndicator = startIndex > 0;
    const showDownIndicator = endIndex < pageItems.length;
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Text, { bold: true, color: "white" }, "📜 Task History (" + totalCount + " total)"),
        React.createElement(Text, { color: "gray" }, "Use \u2191\u2193/j/k to navigate, Enter to select"),
        totalPages > 1 && (React.createElement(Box, null,
            React.createElement(Text, { color: "gray" },
                "Page ",
                currentPage,
                " of ",
                totalPages,
                " "),
            hasPrevPage ? React.createElement(Text, { color: "blue" }, "[\u2190 prev] ") : React.createElement(Text, { color: "gray" }, "[\u2190 prev] "),
            hasNextPage ? React.createElement(Text, { color: "blue" }, "[next \u2192]") : React.createElement(Text, { color: "gray" }, "[next \u2192]"))),
        React.createElement(Text, null, formatSeparator()),
        pageItems.length === 0 ? (React.createElement(Text, null, "No task history available.")) : (React.createElement(Box, { flexDirection: "column" },
            showUpIndicator && React.createElement(Text, { color: "gray" }, "  ↑ " + startIndex + " more above"),
            visibleTasks.map((task, index) => {
                const actualIndex = startIndex + index;
                const isSelected = actualIndex === selectedIndex;
                const date = new Date(task.ts).toLocaleString();
                const taskText = task.task?.substring(0, 60) || "Unknown task";
                const truncated = (task.task?.length || 0) > 60 ? "..." : "";
                return (React.createElement(Box, { flexDirection: "column", key: `${task.id}-${actualIndex}`, marginBottom: 1 },
                    React.createElement(Box, null,
                        React.createElement(Text, { color: isSelected ? "green" : undefined }, isSelected ? "> " : "  "),
                        React.createElement(Text, { color: "gray" }, date)),
                    React.createElement(Box, { marginLeft: 4 },
                        React.createElement(Text, { color: "cyan" }, task.id)),
                    React.createElement(Box, { marginLeft: 4 },
                        React.createElement(Text, { bold: isSelected, color: isSelected ? "white" : undefined },
                            taskText,
                            truncated)),
                    typeof task.totalCost === "number" && (React.createElement(Box, { marginLeft: 4 },
                        React.createElement(Text, { color: "gray" },
                            "Cost: $",
                            task.totalCost ? task.totalCost.toFixed(4) : "0"))),
                    task.modelId && (React.createElement(Box, { marginLeft: 4 },
                        React.createElement(Text, { color: "gray" },
                            "Model: ",
                            task.modelId)))));
            }),
            showDownIndicator && React.createElement(Text, { color: "gray" }, "  ↓ " + (pageItems.length - endIndex) + " more below"))),
        React.createElement(Text, null, formatSeparator())));
};
//# sourceMappingURL=HistoryView.js.map