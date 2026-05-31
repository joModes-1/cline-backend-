/**
 * Generic searchable list component with keyboard navigation
 * Used by ProviderPicker, ModelPicker, LanguagePicker, etc.
 */
import { Box, Text, useInput } from "ink";
// biome-ignore lint/correctness/noUnusedImports: React is needed for JSX at runtime
import React, { useEffect, useMemo, useState } from "react";
import { COLORS } from "../constants/colors";
import { useStdinContext } from "../context/StdinContext";
import { useScrollableList } from "../hooks/useScrollableList";
import { fuzzyFilter } from "../utils/fuzzy-search";
import { isMouseEscapeSequence } from "../utils/input";
const DEFAULT_MAX_ROWS = 8;
export function SearchableList({ items, onSelect, isActive = true, maxRows = DEFAULT_MAX_ROWS, filterFn, }) {
    const { isRawModeSupported } = useStdinContext();
    const [search, setSearch] = useState("");
    const [index, setIndex] = useState(0);
    // Filter items by search using fuzzy matching
    const filteredItems = useMemo(() => {
        if (!search)
            return items;
        // Use custom filter if provided, otherwise use fuzzy search
        if (filterFn) {
            return items.filter((item) => filterFn(item, search));
        }
        return fuzzyFilter(items, search, (item) => `${item.label} ${item.id}`);
    }, [items, search, filterFn]);
    // Use shared scrollable list hook for windowing
    const { visibleStart, visibleCount, showTopIndicator, showBottomIndicator } = useScrollableList(filteredItems.length, index, maxRows);
    const visibleItems = useMemo(() => {
        return filteredItems.slice(visibleStart, visibleStart + visibleCount);
    }, [filteredItems, visibleStart, visibleCount]);
    // Reset index when search changes
    useEffect(() => {
        setIndex(0);
    }, [search]);
    useInput((input, key) => {
        // Filter out mouse escape sequences
        if (isMouseEscapeSequence(input)) {
            return;
        }
        if (key.upArrow) {
            setIndex((prev) => Math.max(0, prev - 1));
        }
        else if (key.downArrow) {
            setIndex((prev) => Math.min(filteredItems.length - 1, prev + 1));
        }
        else if (key.return || key.tab) {
            if (filteredItems[index]) {
                onSelect(filteredItems[index]);
            }
        }
        else if (key.backspace || key.delete) {
            setSearch((prev) => prev.slice(0, -1));
        }
        else if (input && !key.ctrl && !key.meta && !key.escape) {
            setSearch((prev) => prev + input);
        }
    }, { isActive: isRawModeSupported && isActive });
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Box, null,
            React.createElement(Text, { color: "gray" }, "Search: "),
            React.createElement(Text, { color: "white" }, search),
            React.createElement(Text, { inverse: true }, " ")),
        React.createElement(Text, null, " "),
        showTopIndicator && React.createElement(Text, { color: "gray" },
            "... ",
            visibleStart,
            " more above"),
        visibleItems.map((item, i) => {
            const actualIndex = visibleStart + i;
            const isSelected = actualIndex === index;
            return (React.createElement(Box, { key: item.id },
                React.createElement(Text, { color: isSelected ? COLORS.primaryBlue : undefined },
                    isSelected ? "❯ " : "  ",
                    item.label,
                    item.suffix && React.createElement(Text, { color: "gray" },
                        " ",
                        item.suffix))));
        }),
        showBottomIndicator && React.createElement(Text, { color: "gray" },
            "... ",
            filteredItems.length - visibleStart - visibleCount,
            " more below"),
        filteredItems.length === 0 && React.createElement(Text, { color: "gray" },
            "No matches for \"",
            search,
            "\"")));
}
//# sourceMappingURL=SearchableList.js.map