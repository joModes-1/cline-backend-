/**
 * Simple select list component - arrow keys to navigate, Enter to select
 * No search functionality, just a straightforward list picker
 */
import { Box, Text, useInput } from "ink";
// biome-ignore lint/correctness/noUnusedImports: React is needed for JSX transform (tsconfig uses jsx: react)
import React, { useState } from "react";
import { COLORS } from "../constants/colors";
import { useStdinContext } from "../context/StdinContext";
import { isEnterKey } from "../utils/input";
export function SelectList({ items, onSelect, isActive = true }) {
    const { isRawModeSupported } = useStdinContext();
    const [selectedIndex, setSelectedIndex] = useState(0);
    useInput((_input, key) => {
        if (key.upArrow) {
            setSelectedIndex((i) => (i > 0 ? i - 1 : items.length - 1));
        }
        else if (key.downArrow) {
            setSelectedIndex((i) => (i < items.length - 1 ? i + 1 : 0));
        }
        else if (isEnterKey(_input, key)) {
            const item = items[selectedIndex];
            if (item) {
                onSelect(item);
            }
        }
    }, { isActive: isActive && isRawModeSupported });
    return (React.createElement(Box, { flexDirection: "column" }, items.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        return (React.createElement(Box, { key: item.id },
            React.createElement(Text, { color: isSelected ? COLORS.primaryBlue : undefined },
                isSelected ? "❯ " : "  ",
                item.label,
                item.suffix && React.createElement(Text, { color: "gray" },
                    " ",
                    item.suffix))));
    })));
}
//# sourceMappingURL=SelectList.js.map