/**
 * Sub-components and types for ConfigView
 */
import { Box, Text, useInput } from "ink";
import React, { useState } from "react";
import { useStdinContext } from "../context/StdinContext";
export const EXCLUDED_KEYS = new Set(["taskHistory", "primaryRootIndex", "welcomeViewCompleted", "isNewUser"]);
export const EDITABLE_TYPES = new Set(["string", "number", "boolean", "object"]);
export const MAX_VISIBLE = 12;
export const SEPARATOR = "─".repeat(80);
export const TABS = [
    { key: "settings", label: "Settings" },
    { key: "rules", label: "Rules" },
    { key: "workflows", label: "Workflows" },
    { key: "hooks", label: "Hooks", requiresFlag: "hooks" },
    { key: "skills", label: "Skills", requiresFlag: "skills" },
];
// ============================================================================
// Helper Functions
// ============================================================================
export function getValueType(value) {
    if (value === undefined || value === null) {
        return "undefined";
    }
    if (typeof value === "boolean") {
        return "boolean";
    }
    if (typeof value === "number") {
        return "number";
    }
    if (typeof value === "object") {
        return "object";
    }
    return "string";
}
export function isExcluded(key, value) {
    if (EXCLUDED_KEYS.has(key)) {
        return true;
    }
    if (key.endsWith("Toggles") || key.endsWith("ModelInfo")) {
        return true;
    }
    if (key.startsWith("apiConfig_") || key.startsWith("last")) {
        return true;
    }
    if (value === undefined || value === null) {
        return true;
    }
    if (typeof value === "object" && Object.keys(value).length === 0) {
        return true;
    }
    if (Array.isArray(value) && value.length === 0) {
        return true;
    }
    if (typeof value === "string" && value.trim() === "") {
        return true;
    }
    return false;
}
export function formatValue(value, maxLen = 50) {
    if (value === undefined || value === null) {
        return "<not set>";
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (typeof value === "number") {
        return String(value);
    }
    if (typeof value === "object") {
        const json = JSON.stringify(value);
        return json.length > maxLen ? json.slice(0, maxLen - 3) + "..." : json;
    }
    const str = String(value);
    return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}
export function parseValue(input, type) {
    if (type === "boolean") {
        return input.toLowerCase() === "true" || input === "1";
    }
    if (type === "number") {
        const num = Number.parseFloat(input);
        return Number.isNaN(num) ? 0 : num;
    }
    if (type === "object") {
        try {
            return JSON.parse(input);
        }
        catch {
            return {};
        }
    }
    return input;
}
// Import isSettingsKey at module level for proper test mocking
import { isSettingsKey } from "@shared/storage/state-keys";
export function buildConfigEntries(state, source) {
    return Object.entries(state)
        .filter(([key, value]) => !isExcluded(key, value))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => {
        const type = getValueType(value);
        const isEditable = EDITABLE_TYPES.has(type) && (source === "workspace" || isSettingsKey(key));
        return { key, value, type, isEditable, source };
    });
}
export function buildToggleEntries(toggles, source, ruleType) {
    if (!toggles) {
        return [];
    }
    return Object.entries(toggles)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, enabled]) => ({ path, enabled, source, ruleType }));
}
export function getFileName(path) {
    return path.split("/").pop() || path;
}
export const TextInput = ({ label, onChange, onCancel, onSubmit, type, value }) => {
    const { isRawModeSupported } = useStdinContext();
    useInput((input, key) => {
        if (key.escape) {
            onCancel();
        }
        else if (key.return) {
            onSubmit(value);
        }
        else if (key.backspace || key.delete) {
            onChange(value.slice(0, -1));
        }
        else if (input && !key.ctrl && !key.meta) {
            onChange(value + input);
        }
    }, { isActive: isRawModeSupported });
    return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
        React.createElement(Text, { bold: true, color: "cyan" },
            "Edit: ",
            label),
        React.createElement(Box, null,
            React.createElement(Text, { color: "white" }, value),
            React.createElement(Text, { color: "cyan" }, "|")),
        React.createElement(Text, { color: "gray" },
            "Type: ",
            type,
            " \u2022 Enter to save \u2022 Esc to cancel")));
};
export const BooleanSelect = ({ label, onCancel, onSelect, value }) => {
    const { isRawModeSupported } = useStdinContext();
    const [selected, setSelected] = useState(value);
    useInput((_input, key) => {
        if (key.escape) {
            onCancel();
        }
        else if (key.return) {
            onSelect(selected);
        }
        else if (key.upArrow || key.downArrow) {
            setSelected((prev) => !prev);
        }
    }, { isActive: isRawModeSupported });
    return (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
        React.createElement(Text, { bold: true, color: "cyan" },
            "Edit: ",
            label),
        React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { color: selected ? "green" : undefined },
                selected ? "❯ " : "  ",
                "true"),
            React.createElement(Text, { color: !selected ? "green" : undefined },
                !selected ? "❯ " : "  ",
                "false")),
        React.createElement(Text, { color: "gray" }, "\u2191/\u2193 to toggle \u2022 Enter to save \u2022 Esc to cancel")));
};
export const ConfigRow = ({ entry, isSelected }) => {
    const valueColor = entry.type === "boolean" ? (entry.value ? "green" : "red") : "white";
    return (React.createElement(Box, null,
        React.createElement(Text, { color: isSelected ? "cyan" : undefined },
            isSelected ? "❯ " : "  ",
            React.createElement(Text, { color: "cyan" }, entry.key),
            React.createElement(Text, { color: "gray" }, ": "),
            React.createElement(Text, { color: valueColor }, formatValue(entry.value)),
            !entry.isEditable && React.createElement(Text, { color: "gray" }, " (read-only)"))));
};
export const ToggleRow = ({ entry, isSelected, showType }) => {
    const fileName = getFileName(entry.path);
    const typeLabel = entry.ruleType ? ` [${entry.ruleType}]` : "";
    return (React.createElement(Box, null,
        React.createElement(Text, { color: isSelected ? "cyan" : undefined },
            isSelected ? "❯ " : "  ",
            React.createElement(Text, { color: entry.enabled ? "green" : "red" }, entry.enabled ? "●" : "○"),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: "white" }, fileName),
            showType && React.createElement(Text, { color: "gray" }, typeLabel))));
};
export const HookRow = ({ hook, isSelected }) => {
    return (React.createElement(Box, null,
        React.createElement(Text, { color: isSelected ? "cyan" : undefined },
            isSelected ? "❯ " : "  ",
            React.createElement(Text, { color: hook.enabled ? "green" : "red" }, hook.enabled ? "●" : "○"),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: "white" }, hook.name))));
};
export const SkillRow = ({ skill, isSelected }) => {
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Box, null,
            React.createElement(Text, { color: isSelected ? "cyan" : undefined },
                isSelected ? "❯ " : "  ",
                React.createElement(Text, { color: skill.enabled ? "green" : "red" }, skill.enabled ? "●" : "○"),
                React.createElement(Text, null, " "),
                React.createElement(Text, { bold: true, color: "white" }, skill.name))),
        skill.description && (React.createElement(Box, { marginLeft: 4 },
            React.createElement(Text, { color: "gray" }, skill.description.length > 60 ? skill.description.slice(0, 57) + "..." : skill.description)))));
};
export const TabBar = ({ currentTab, tabs, hooksEnabled, skillsEnabled }) => {
    const visibleTabs = tabs.filter((tab) => {
        if (tab.requiresFlag === "hooks") {
            return hooksEnabled;
        }
        if (tab.requiresFlag === "skills") {
            return skillsEnabled;
        }
        return true;
    });
    return (React.createElement(Box, { marginBottom: 1 }, visibleTabs.map((tab, idx) => (React.createElement(React.Fragment, { key: tab.key },
        idx > 0 && React.createElement(Text, { color: "gray" }, " \u2502 "),
        React.createElement(Text, { bold: currentTab === tab.key, color: currentTab === tab.key ? "cyan" : "gray" }, currentTab === tab.key ? `[${tab.label}]` : tab.label))))));
};
export const SectionHeader = ({ title }) => (React.createElement(Box, { marginTop: 1 },
    React.createElement(Text, { bold: true, color: "yellow" }, title)));
export const ObjectEditorPanel = ({ state, setState, onClose, onPersist, getObjectAtPath, setObjectValueAtPath, }) => {
    const { isRawModeSupported } = useStdinContext();
    const currentNode = getObjectAtPath(state.value, state.path);
    const objectEntries = Object.entries(currentNode).sort(([a], [b]) => a.localeCompare(b));
    const selectedEntry = objectEntries[state.selectedIndex];
    const breadcrumb = [state.key, ...state.path].join(" › ");
    useInput((input, key) => {
        if (state.isEditingValue) {
            if (key.escape) {
                setState((prev) => (prev ? { ...prev, isEditingValue: false, editValue: "" } : prev));
                return;
            }
            if (key.return) {
                if (!selectedEntry) {
                    setState((prev) => (prev ? { ...prev, isEditingValue: false, editValue: "" } : prev));
                    return;
                }
                const [entryKey, entryValue] = selectedEntry;
                let parsed = state.editValue;
                if (typeof entryValue === "boolean") {
                    parsed = state.editValue.toLowerCase() === "true" || state.editValue === "1";
                }
                else if (typeof entryValue === "number") {
                    const maybeNum = Number(state.editValue);
                    parsed = Number.isNaN(maybeNum) ? 0 : maybeNum;
                }
                const nextObject = setObjectValueAtPath(state.value, state.path, entryKey, parsed);
                onPersist(nextObject);
                setState((prev) => (prev ? { ...prev, value: nextObject, isEditingValue: false, editValue: "" } : prev));
                return;
            }
            if (key.backspace || key.delete) {
                setState((prev) => (prev ? { ...prev, editValue: prev.editValue.slice(0, -1) } : prev));
                return;
            }
            if (input && !key.ctrl && !key.meta) {
                setState((prev) => (prev ? { ...prev, editValue: prev.editValue + input } : prev));
            }
            return;
        }
        if (key.escape) {
            if (state.path.length > 0) {
                setState((prev) => (prev ? { ...prev, path: prev.path.slice(0, -1), selectedIndex: 0 } : prev));
            }
            else {
                onClose();
            }
            return;
        }
        if (key.upArrow || input === "k") {
            setState((prev) => prev
                ? {
                    ...prev,
                    selectedIndex: objectEntries.length > 0
                        ? prev.selectedIndex > 0
                            ? prev.selectedIndex - 1
                            : objectEntries.length - 1
                        : 0,
                }
                : prev);
            return;
        }
        if (key.downArrow || input === "j") {
            setState((prev) => prev
                ? {
                    ...prev,
                    selectedIndex: objectEntries.length > 0
                        ? prev.selectedIndex < objectEntries.length - 1
                            ? prev.selectedIndex + 1
                            : 0
                        : 0,
                }
                : prev);
            return;
        }
        if (key.return || key.tab) {
            if (!selectedEntry) {
                return;
            }
            const [entryKey, entryValue] = selectedEntry;
            if (typeof entryValue === "boolean") {
                const nextObject = setObjectValueAtPath(state.value, state.path, entryKey, !entryValue);
                onPersist(nextObject);
                setState((prev) => (prev ? { ...prev, value: nextObject } : prev));
                return;
            }
            if (entryValue && typeof entryValue === "object" && !Array.isArray(entryValue)) {
                setState((prev) => (prev ? { ...prev, path: [...prev.path, entryKey], selectedIndex: 0 } : prev));
                return;
            }
            setState((prev) => prev
                ? { ...prev, isEditingValue: true, editValue: entryValue !== undefined ? String(entryValue) : "" }
                : prev);
        }
    }, { isActive: isRawModeSupported });
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Text, { bold: true, color: "white" }, "\u2699\uFE0F Edit Nested Object"),
        React.createElement(Text, { color: "gray" }, SEPARATOR),
        React.createElement(Text, { color: "cyan" }, breadcrumb),
        state.isEditingValue ? (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
            React.createElement(Box, null,
                React.createElement(Text, { color: "white" }, state.editValue),
                React.createElement(Text, { color: "cyan" }, "|")),
            React.createElement(Text, { color: "gray" }, "Enter to save \u2022 Esc to cancel"))) : (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
            objectEntries.length === 0 ? (React.createElement(Text, { color: "gray" }, "No nested keys at this level.")) : (objectEntries.map(([key, value], idx) => {
                const isSelected = idx === state.selectedIndex;
                const valueText = value && typeof value === "object" && !Array.isArray(value) ? "{...}" : String(value);
                return (React.createElement(Text, { color: isSelected ? "cyan" : undefined, key: key },
                    isSelected ? "❯ " : "  ",
                    React.createElement(Text, { color: "cyan" }, key),
                    React.createElement(Text, { color: "gray" }, ": "),
                    React.createElement(Text, { color: "white" }, valueText)));
            })),
            React.createElement(Text, { color: "gray" }, "\u2191/\u2193 Navigate \u2022 Enter/Tab Edit or drill in \u2022 Esc Back/Close")))));
};
//# sourceMappingURL=ConfigViewComponents.js.map