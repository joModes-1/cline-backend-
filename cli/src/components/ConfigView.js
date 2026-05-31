/**
 * Interactive config view component for displaying and editing configuration values
 * Supports tabs for Settings, Rules, Workflows, Hooks, and Skills
 */
import { SETTINGS_DEFAULTS, } from "@shared/storage/state-keys";
import { Box, Text, useApp, useInput } from "ink";
import React, { useMemo, useState } from "react";
import { useStdinContext } from "../context/StdinContext";
import { fuzzyFilter } from "../utils/fuzzy-search";
import { BooleanSelect, buildConfigEntries, buildToggleEntries, ConfigRow, HookRow, MAX_VISIBLE, ObjectEditorPanel, parseValue, SEPARATOR, SectionHeader, SkillRow, TABS, TabBar, TextInput, ToggleRow, } from "./ConfigViewComponents";
// ============================================================================
// Main Component
// ============================================================================
export const ConfigView = ({ dataDir, globalState, workspaceState, onUpdateGlobal, onUpdateWorkspace, globalClineRulesToggles, localClineRulesToggles, localCursorRulesToggles, localWindsurfRulesToggles, localAgentsRulesToggles, onToggleRule, globalWorkflowToggles, localWorkflowToggles, onToggleWorkflow, hooksEnabled, globalHooks = [], workspaceHooks = [], onToggleHook, skillsEnabled, globalSkills = [], localSkills = [], onToggleSkill, onOpenFolder, }) => {
    const { exit } = useApp();
    const { isRawModeSupported } = useStdinContext();
    const [currentTab, setCurrentTab] = useState("settings");
    const [isEditing, setIsEditing] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [editValue, setEditValue] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [objectEditor, setObjectEditor] = useState(null);
    // Build entries for settings tab
    const configEntries = useMemo(() => [...buildConfigEntries(globalState, "global"), ...buildConfigEntries(workspaceState, "workspace")], [globalState, workspaceState]);
    const filteredConfigEntries = useMemo(() => {
        if (!searchQuery.trim()) {
            return configEntries;
        }
        return fuzzyFilter(configEntries, searchQuery, (entry) => `${entry.key} ${String(entry.value ?? "")}`);
    }, [configEntries, searchQuery]);
    // Build entries for rules tab
    const ruleEntries = useMemo(() => {
        const entries = [];
        entries.push(...buildToggleEntries(globalClineRulesToggles, "global", "cline"));
        entries.push(...buildToggleEntries(localClineRulesToggles, "workspace", "cline"));
        entries.push(...buildToggleEntries(localCursorRulesToggles, "workspace", "cursor"));
        entries.push(...buildToggleEntries(localWindsurfRulesToggles, "workspace", "windsurf"));
        entries.push(...buildToggleEntries(localAgentsRulesToggles, "workspace", "agents"));
        return entries;
    }, [
        globalClineRulesToggles,
        localClineRulesToggles,
        localCursorRulesToggles,
        localWindsurfRulesToggles,
        localAgentsRulesToggles,
    ]);
    // Build entries for workflows tab
    const workflowEntries = useMemo(() => {
        const entries = [];
        entries.push(...buildToggleEntries(globalWorkflowToggles, "global"));
        entries.push(...buildToggleEntries(localWorkflowToggles, "workspace"));
        return entries;
    }, [globalWorkflowToggles, localWorkflowToggles]);
    // Build flat list of hooks
    const hookEntries = useMemo(() => {
        const entries = [];
        globalHooks.forEach((hook) => entries.push({ hook, isGlobal: true }));
        workspaceHooks.forEach((ws) => {
            ws.hooks.forEach((hook) => entries.push({ hook, isGlobal: false, workspaceName: ws.workspaceName }));
        });
        return entries.sort((a, b) => a.hook.name.localeCompare(b.hook.name));
    }, [globalHooks, workspaceHooks]);
    // Build flat list of skills
    const skillEntries = useMemo(() => {
        const entries = [];
        globalSkills.forEach((skill) => entries.push({ skill, isGlobal: true }));
        localSkills.forEach((skill) => entries.push({ skill, isGlobal: false }));
        return entries.sort((a, b) => a.skill.name.localeCompare(b.skill.name));
    }, [globalSkills, localSkills]);
    // Get current list length based on tab
    const currentListLength = useMemo(() => {
        switch (currentTab) {
            case "settings":
                return filteredConfigEntries.length;
            case "rules":
                return ruleEntries.length;
            case "workflows":
                return workflowEntries.length;
            case "hooks":
                return hookEntries.length;
            case "skills":
                return skillEntries.length;
            default:
                return 0;
        }
    }, [
        currentTab,
        filteredConfigEntries.length,
        ruleEntries.length,
        workflowEntries.length,
        hookEntries.length,
        skillEntries.length,
    ]);
    // Get available tabs
    const availableTabs = useMemo(() => {
        return TABS.filter((tab) => {
            if (tab.requiresFlag === "hooks") {
                return hooksEnabled;
            }
            if (tab.requiresFlag === "skills") {
                return skillsEnabled;
            }
            return true;
        });
    }, [hooksEnabled, skillsEnabled]);
    // Reset selection when changing tabs
    const handleTabChange = (newTab) => {
        setCurrentTab(newTab);
        setSelectedIndex(0);
        setIsEditing(false);
        setObjectEditor(null);
    };
    // Settings tab handlers
    const selectedConfigEntry = filteredConfigEntries[selectedIndex];
    const handleSettingsSave = (value) => {
        if (!selectedConfigEntry) {
            return;
        }
        const parsed = typeof value === "boolean" ? value : parseValue(value, selectedConfigEntry.type);
        if (selectedConfigEntry.source === "global" && onUpdateGlobal) {
            onUpdateGlobal(selectedConfigEntry.key, parsed);
        }
        else if (selectedConfigEntry.source === "workspace" && onUpdateWorkspace) {
            onUpdateWorkspace(selectedConfigEntry.key, parsed);
        }
        setIsEditing(false);
    };
    const getObjectAtPath = (root, path) => {
        let current = root;
        for (const segment of path) {
            if (!current || typeof current !== "object") {
                return {};
            }
            current = current[segment];
        }
        return current && typeof current === "object" ? current : {};
    };
    const setObjectValueAtPath = (root, path, key, value) => {
        if (path.length === 0) {
            return { ...root, [key]: value };
        }
        const [head, ...rest] = path;
        const child = root[head];
        const childObj = child && typeof child === "object" ? child : {};
        return {
            ...root,
            [head]: setObjectValueAtPath(childObj, rest, key, value),
        };
    };
    const persistObjectEditor = (nextObject, source, key) => {
        if (source === "global" && onUpdateGlobal) {
            onUpdateGlobal(key, nextObject);
        }
        else if (source === "workspace" && onUpdateWorkspace) {
            onUpdateWorkspace(key, nextObject);
        }
    };
    const handleSettingsReset = () => {
        if (!selectedConfigEntry?.isEditable || selectedConfigEntry.source !== "global") {
            return;
        }
        const defaultValue = SETTINGS_DEFAULTS[selectedConfigEntry.key];
        if (defaultValue !== undefined && onUpdateGlobal) {
            onUpdateGlobal(selectedConfigEntry.key, defaultValue);
        }
    };
    // Toggle handlers for rules/workflows/hooks/skills
    const handleToggle = () => {
        if (currentTab === "rules" && ruleEntries[selectedIndex] && onToggleRule) {
            const entry = ruleEntries[selectedIndex];
            onToggleRule(entry.source === "global", entry.path, !entry.enabled, entry.ruleType || "cline");
        }
        else if (currentTab === "workflows" && workflowEntries[selectedIndex] && onToggleWorkflow) {
            const entry = workflowEntries[selectedIndex];
            onToggleWorkflow(entry.source === "global", entry.path, !entry.enabled);
        }
        else if (currentTab === "hooks" && hookEntries[selectedIndex] && onToggleHook) {
            const entry = hookEntries[selectedIndex];
            onToggleHook(entry.isGlobal, entry.hook.name, !entry.hook.enabled, entry.workspaceName);
        }
        else if (currentTab === "skills" && skillEntries[selectedIndex] && onToggleSkill) {
            const entry = skillEntries[selectedIndex];
            onToggleSkill(entry.isGlobal, entry.skill.path, !entry.skill.enabled);
        }
    };
    // Input handling
    useInput((input, key) => {
        if (objectEditor) {
            return;
        }
        if (key.escape) {
            exit();
        }
        if (key.leftArrow || key.rightArrow || (input >= "1" && input <= "5")) {
            const currentTabIndex = availableTabs.findIndex((t) => t.key === currentTab);
            const targetIdx = input >= "1" && input <= "5"
                ? Number.parseInt(input) - 1
                : key.leftArrow
                    ? (currentTabIndex - 1 + availableTabs.length) % availableTabs.length
                    : (currentTabIndex + 1) % availableTabs.length;
            if (targetIdx >= 0 && targetIdx < availableTabs.length) {
                handleTabChange(availableTabs[targetIdx].key);
            }
            return;
        }
        // List navigation (arrow keys and vim-style j/k)
        if (key.upArrow) {
            setSelectedIndex((i) => (i > 0 ? i - 1 : currentListLength - 1));
        }
        else if (key.downArrow) {
            setSelectedIndex((i) => (i < currentListLength - 1 ? i + 1 : 0));
        }
        // Tab-specific actions
        if (currentTab === "settings") {
            if ((key.return || key.tab) && selectedConfigEntry?.isEditable) {
                if (selectedConfigEntry.type === "boolean") {
                    handleSettingsSave(!selectedConfigEntry.value);
                    return;
                }
                if (selectedConfigEntry.type === "object") {
                    const value = selectedConfigEntry.value && typeof selectedConfigEntry.value === "object"
                        ? selectedConfigEntry.value
                        : {};
                    setObjectEditor({
                        source: selectedConfigEntry.source,
                        key: selectedConfigEntry.key,
                        path: [],
                        value,
                        selectedIndex: 0,
                        isEditingValue: false,
                        editValue: "",
                    });
                    return;
                }
                setEditValue(selectedConfigEntry.value !== undefined ? String(selectedConfigEntry.value) : "");
                setIsEditing(true);
            }
            else if (key.ctrl && input.toLowerCase() === "r") {
                handleSettingsReset();
            }
            else if (key.backspace || key.delete) {
                setSearchQuery((prev) => prev.slice(0, -1));
            }
            else if (input && !key.ctrl && !key.meta && !key.escape && !key.upArrow && !key.downArrow) {
                setSearchQuery((prev) => prev + input);
            }
        }
        else if (key.return || key.tab || input === " ") {
            // Toggle for rules/workflows/hooks/skills
            handleToggle();
        }
        // Open folder (for rules/workflows/hooks/skills tabs)
        if (input === "o" && onOpenFolder && currentTab !== "settings") {
            // Determine if current selection is global or workspace based on the selected entry
            let isGlobal = true;
            if (currentTab === "rules" && ruleEntries[selectedIndex]) {
                isGlobal = ruleEntries[selectedIndex].source === "global";
            }
            else if (currentTab === "workflows" && workflowEntries[selectedIndex]) {
                isGlobal = workflowEntries[selectedIndex].source === "global";
            }
            else if (currentTab === "hooks" && hookEntries[selectedIndex]) {
                isGlobal = hookEntries[selectedIndex].isGlobal;
            }
            else if (currentTab === "skills" && skillEntries[selectedIndex]) {
                isGlobal = skillEntries[selectedIndex].isGlobal;
            }
            onOpenFolder(currentTab, isGlobal);
        }
    }, { isActive: isRawModeSupported && !isEditing });
    // Scrolling window
    const halfVisible = Math.floor(MAX_VISIBLE / 2);
    const startIndex = Math.max(0, Math.min(selectedIndex - halfVisible, currentListLength - MAX_VISIBLE));
    // Edit mode UI (settings only)
    if (isEditing && selectedConfigEntry && currentTab === "settings") {
        const header = (React.createElement(React.Fragment, null,
            React.createElement(Text, { bold: true, color: "white" }, "\u2699\uFE0F Edit Configuration"),
            React.createElement(Text, { color: "gray" }, SEPARATOR)));
        if (selectedConfigEntry.type === "boolean") {
            return (React.createElement(Box, { flexDirection: "column" },
                header,
                React.createElement(BooleanSelect, { label: selectedConfigEntry.key, onCancel: () => setIsEditing(false), onSelect: handleSettingsSave, value: Boolean(selectedConfigEntry.value) })));
        }
        return (React.createElement(Box, { flexDirection: "column" },
            header,
            React.createElement(TextInput, { label: selectedConfigEntry.key, onCancel: () => setIsEditing(false), onChange: setEditValue, onSubmit: handleSettingsSave, type: selectedConfigEntry.type, value: editValue })));
    }
    if (objectEditor && currentTab === "settings") {
        return (React.createElement(ObjectEditorPanel, { getObjectAtPath: getObjectAtPath, onClose: () => setObjectEditor(null), onPersist: (nextObject) => persistObjectEditor(nextObject, objectEditor.source, objectEditor.key), setObjectValueAtPath: setObjectValueAtPath, setState: setObjectEditor, state: objectEditor }));
    }
    // Render tab content
    const renderTabContent = () => {
        switch (currentTab) {
            case "settings": {
                const visibleEntries = filteredConfigEntries.slice(startIndex, startIndex + MAX_VISIBLE);
                return (React.createElement(React.Fragment, null,
                    React.createElement(Box, null,
                        React.createElement(Text, null, "Search: "),
                        React.createElement(Text, { color: "white" }, searchQuery),
                        React.createElement(Text, { inverse: true }, " ")),
                    React.createElement(Box, null,
                        React.createElement(Text, null, "Data directory: "),
                        React.createElement(Text, { color: "blue", underline: true }, dataDir)),
                    React.createElement(Text, { color: "gray" }, SEPARATOR),
                    React.createElement(Box, { flexDirection: "column" }, visibleEntries.map((entry, idx) => {
                        const actualIndex = startIndex + idx;
                        const prevEntry = visibleEntries[idx - 1];
                        const showHeader = !prevEntry || prevEntry.source !== entry.source;
                        return (React.createElement(React.Fragment, { key: `${entry.source}-${entry.key}` },
                            showHeader && (React.createElement(SectionHeader, { title: entry.source === "global" ? "Global Settings:" : "Workspace Settings:" })),
                            React.createElement(ConfigRow, { entry: entry, isSelected: actualIndex === selectedIndex })));
                    }))));
            }
            case "rules": {
                if (ruleEntries.length === 0) {
                    return (React.createElement(Box, null,
                        React.createElement(Text, { color: "gray" }, "No rules configured. Add .clinerules files to your workspace or global config.")));
                }
                const visibleEntries = ruleEntries.slice(startIndex, startIndex + MAX_VISIBLE);
                return (React.createElement(Box, { flexDirection: "column" }, visibleEntries.map((entry, idx) => {
                    const actualIndex = startIndex + idx;
                    const prevEntry = visibleEntries[idx - 1];
                    const showHeader = !prevEntry || prevEntry.source !== entry.source;
                    return (React.createElement(React.Fragment, { key: `${entry.source}-${entry.path}` },
                        showHeader && (React.createElement(SectionHeader, { title: entry.source === "global" ? "Global Rules:" : "Workspace Rules:" })),
                        React.createElement(ToggleRow, { entry: entry, isSelected: actualIndex === selectedIndex, showType: true })));
                })));
            }
            case "workflows": {
                if (workflowEntries.length === 0) {
                    return (React.createElement(Box, null,
                        React.createElement(Text, { color: "gray" }, "No workflows configured. Add workflow files to enable this feature.")));
                }
                const visibleEntries = workflowEntries.slice(startIndex, startIndex + MAX_VISIBLE);
                return (React.createElement(Box, { flexDirection: "column" }, visibleEntries.map((entry, idx) => {
                    const actualIndex = startIndex + idx;
                    const prevEntry = visibleEntries[idx - 1];
                    const showHeader = !prevEntry || prevEntry.source !== entry.source;
                    return (React.createElement(React.Fragment, { key: `${entry.source}-${entry.path}` },
                        showHeader && (React.createElement(SectionHeader, { title: entry.source === "global" ? "Global Workflows:" : "Workspace Workflows:" })),
                        React.createElement(ToggleRow, { entry: entry, isSelected: actualIndex === selectedIndex })));
                })));
            }
            case "hooks": {
                if (hookEntries.length === 0) {
                    return (React.createElement(Box, null,
                        React.createElement(Text, { color: "gray" }, "No hooks configured. Add hook scripts to enable automation.")));
                }
                const visibleEntries = hookEntries.slice(startIndex, startIndex + MAX_VISIBLE);
                return (React.createElement(Box, { flexDirection: "column" }, visibleEntries.map((entry, idx) => {
                    const actualIndex = startIndex + idx;
                    const prevEntry = visibleEntries[idx - 1];
                    const showHeader = !prevEntry ||
                        prevEntry.isGlobal !== entry.isGlobal ||
                        prevEntry.workspaceName !== entry.workspaceName;
                    let sectionTitle = "Global Hooks:";
                    if (!entry.isGlobal && entry.workspaceName) {
                        sectionTitle = `${entry.workspaceName} Hooks:`;
                    }
                    return (React.createElement(React.Fragment, { key: `${entry.isGlobal}-${entry.workspaceName || ""}-${entry.hook.name}` },
                        showHeader && React.createElement(SectionHeader, { title: sectionTitle }),
                        React.createElement(HookRow, { hook: entry.hook, isSelected: actualIndex === selectedIndex })));
                })));
            }
            case "skills": {
                if (skillEntries.length === 0) {
                    return (React.createElement(Box, null,
                        React.createElement(Text, { color: "gray" }, "No skills configured. Add SKILL.md files to enable skills.")));
                }
                const visibleEntries = skillEntries.slice(startIndex, startIndex + MAX_VISIBLE);
                return (React.createElement(Box, { flexDirection: "column" }, visibleEntries.map((entry, idx) => {
                    const actualIndex = startIndex + idx;
                    const prevEntry = visibleEntries[idx - 1];
                    const showHeader = !prevEntry || prevEntry.isGlobal !== entry.isGlobal;
                    return (React.createElement(React.Fragment, { key: `${entry.isGlobal}-${entry.skill.path}` },
                        showHeader && (React.createElement(SectionHeader, { title: entry.isGlobal ? "Global Skills:" : "Workspace Skills:" })),
                        React.createElement(SkillRow, { isSelected: actualIndex === selectedIndex, skill: entry.skill })));
                })));
            }
            default:
                return null;
        }
    };
    // Help text based on current tab
    const getHelpText = () => {
        const base = "↑/↓ Navigate • ←/→ tabs • 1-5 tabs • Esc Exit";
        if (currentTab === "settings") {
            return `${base} • Type to search • Enter/Tab Edit (booleans toggle) • Backspace clear search • Ctrl+R Reset`;
        }
        const openFolder = onOpenFolder ? " • o Open folder" : "";
        return `${base} • Enter/Tab/Space Toggle${openFolder}`;
    };
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Text, { bold: true, color: "white" }, "\u2699\uFE0F Cline Configuration"),
        React.createElement(Text, { color: "gray" }, SEPARATOR),
        React.createElement(TabBar, { currentTab: currentTab, hooksEnabled: hooksEnabled, skillsEnabled: skillsEnabled, tabs: TABS }),
        React.createElement(Text, { color: "gray" }, SEPARATOR),
        renderTabContent(),
        currentListLength > MAX_VISIBLE && (React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { color: "gray" },
                startIndex > 0 ? "↑ " : "  ",
                "Showing ",
                startIndex + 1,
                "-",
                Math.min(startIndex + MAX_VISIBLE, currentListLength),
                " of ",
                currentListLength,
                startIndex + MAX_VISIBLE < currentListLength ? " ↓" : "  "))),
        React.createElement(Text, { color: "gray" }, SEPARATOR),
        React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { color: "gray" }, getHelpText()),
            currentTab === "settings" && selectedConfigEntry && !selectedConfigEntry.isEditable && (React.createElement(Text, { color: "yellow" },
                "This field is read-only (",
                selectedConfigEntry.type,
                " type or not a setting)")))));
};
//# sourceMappingURL=ConfigView.js.map