/**
 * Welcome view component
 * Shows an interactive prompt when user starts cline without a command
 * Supports file mentions with @
 */
import { Box, Text, useInput } from "ink";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StateManager } from "@/core/storage/StateManager";
import { getProviderDefaultModelId, getProviderModelIdKey } from "@/shared/storage";
import { useStdinContext } from "../context/StdinContext";
import { checkAndWarnRipgrepMissing, extractMentionQuery, getRipgrepInstallInstructions, insertMention, searchWorkspaceFiles, } from "../utils/file-search";
import { isMouseEscapeSequence } from "../utils/input";
import { parseImagesFromInput } from "../utils/parser";
import { AccountInfoView } from "./AccountInfoView";
import { FileMentionMenu } from "./FileMentionMenu";
// ASCII art Cline logo
const CLINE_LOGO = [
    "            :::::::            ",
    "           :::::::::           ",
    "       :::::::::::::::::       ",
    "    :::::::::::::::::::::::    ",
    "   :::::::::::::::::::::::::   ",
    "  :::::::::::::::::::::::::::  ",
    "  :::::::   :::::::   :::::::  ",
    " :::::::     :::::     ::::::: ",
    "::::::::     :::::     ::::::::",
    "::::::::     :::::     ::::::::",
    " :::::::     :::::     ::::::: ",
    "  :::::::   :::::::   :::::::  ",
    "  :::::::::::::::::::::::::::  ",
    "   :::::::::::::::::::::::::   ",
    "    :::::::::::::::::::::::    ",
    "       ::::::::::::::::       ",
];
const SEARCH_DEBOUNCE_MS = 150;
const RIPGREP_WARNING_DURATION_MS = 5000;
const MAX_SEARCH_RESULTS = 15;
export const WelcomeView = ({ onSubmit, onExit, controller }) => {
    const { isRawModeSupported } = useStdinContext();
    const [textInput, setTextInput] = useState("");
    const [fileResults, setFileResults] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [showRipgrepWarning, setShowRipgrepWarning] = useState(false);
    const [escPressedOnce, setEscPressedOnce] = useState(false);
    const [mode, setMode] = useState(() => {
        const stateManager = StateManager.get();
        return stateManager.getGlobalSettingsKey("mode") || "act";
    });
    const provider = useMemo(() => {
        const stateManager = StateManager.get();
        const mode = stateManager.getGlobalSettingsKey("mode");
        const providerKey = mode === "act" ? "actModeApiProvider" : "planModeApiProvider";
        const currentProvider = stateManager.getGlobalSettingsKey(providerKey);
        return currentProvider || "cline";
    }, [controller]);
    // Get model ID based on current mode and provider
    // Different providers use different state keys (e.g., cline uses actModeOpenRouterModelId)
    const modelId = useMemo(() => {
        const stateManager = StateManager.get();
        const modelKey = getProviderModelIdKey(provider, mode);
        return (stateManager.getGlobalSettingsKey(modelKey) ||
            getProviderDefaultModelId(provider));
    }, [mode, provider]);
    const toggleMode = useCallback(() => {
        const newMode = mode === "act" ? "plan" : "act";
        setMode(newMode);
        const stateManager = StateManager.get();
        stateManager.setGlobalState("mode", newMode);
    }, [mode]);
    const refs = useRef({
        searchTimeout: null,
        lastQuery: "",
        hasCheckedRipgrep: false,
    });
    const { prompt, imagePaths } = parseImagesFromInput(textInput);
    const mentionInfo = useMemo(() => extractMentionQuery(textInput), [textInput]);
    const workspacePath = useMemo(() => {
        try {
            const root = controller?.getWorkspaceManagerSync?.()?.getPrimaryRoot?.();
            if (root?.path) {
                return root.path;
            }
        }
        catch {
            // Fallback to cwd
        }
        return process.cwd();
    }, [controller]);
    // Search for files when in mention mode
    useEffect(() => {
        const { current: r } = refs;
        if (!mentionInfo.inMentionMode) {
            setFileResults([]);
            setSelectedIndex(0);
            if (r.searchTimeout) {
                clearTimeout(r.searchTimeout);
                r.searchTimeout = null;
            }
            return;
        }
        // Check for ripgrep on first mention trigger
        if (!r.hasCheckedRipgrep) {
            r.hasCheckedRipgrep = true;
            if (checkAndWarnRipgrepMissing()) {
                setShowRipgrepWarning(true);
                setTimeout(() => setShowRipgrepWarning(false), RIPGREP_WARNING_DURATION_MS);
            }
        }
        const { query } = mentionInfo;
        if (query === r.lastQuery) {
            return;
        }
        r.lastQuery = query;
        if (r.searchTimeout) {
            clearTimeout(r.searchTimeout);
        }
        setIsSearching(true);
        r.searchTimeout = setTimeout(async () => {
            try {
                const results = await searchWorkspaceFiles(query, workspacePath, MAX_SEARCH_RESULTS);
                setFileResults(results);
                setSelectedIndex(0);
            }
            catch {
                setFileResults([]);
            }
            finally {
                setIsSearching(false);
            }
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            if (r.searchTimeout) {
                clearTimeout(r.searchTimeout);
            }
        };
    }, [mentionInfo.inMentionMode, mentionInfo.query, workspacePath]);
    useInput((input, key) => {
        // Filter out mouse escape sequences
        if (isMouseEscapeSequence(input)) {
            return;
        }
        const inMenu = mentionInfo.inMentionMode && fileResults.length > 0;
        // Menu navigation
        if (inMenu) {
            if (key.upArrow) {
                setSelectedIndex((i) => (i > 0 ? i - 1 : fileResults.length - 1));
                return;
            }
            if (key.downArrow) {
                setSelectedIndex((i) => (i < fileResults.length - 1 ? i + 1 : 0));
                return;
            }
            if (key.tab || key.return) {
                const file = fileResults[selectedIndex];
                if (file) {
                    setTextInput(insertMention(textInput, mentionInfo.atIndex, file.path));
                    setFileResults([]);
                    setSelectedIndex(0);
                }
                return;
            }
            if (key.escape) {
                setFileResults([]);
                setSelectedIndex(0);
                return;
            }
        }
        // Normal input handling
        if (key.tab && !mentionInfo.inMentionMode) {
            toggleMode();
            return;
        }
        if (key.return && !mentionInfo.inMentionMode) {
            if (prompt.trim() || imagePaths.length > 0) {
                onSubmit(prompt.trim(), imagePaths);
            }
            return;
        }
        if (key.escape && !mentionInfo.inMentionMode) {
            if (escPressedOnce) {
                onExit?.();
            }
            else {
                setEscPressedOnce(true);
            }
            return;
        }
        if (key.backspace || key.delete) {
            setTextInput((prev) => prev.slice(0, -1));
            setEscPressedOnce(false);
            return;
        }
        if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow && !key.tab) {
            setTextInput((prev) => prev + input);
            setEscPressedOnce(false);
        }
    }, { isActive: isRawModeSupported });
    const borderColor = mode === "act" ? "blue" : "yellow";
    return (React.createElement(Box, { flexDirection: "column", width: "100%" },
        controller && (React.createElement(Box, { marginBottom: 1 },
            React.createElement(AccountInfoView, { controller: controller }))),
        React.createElement(Box, { alignItems: "center", flexDirection: "column" }, CLINE_LOGO.map((line, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static array that never changes
        React.createElement(Text, { color: "white", key: idx }, line)))),
        React.createElement(Box, { justifyContent: "center", marginTop: 1 },
            React.createElement(Text, { bold: true, color: "white" }, "What can I do for you?")),
        showRipgrepWarning && (React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { color: "yellow" }, "\u26A0 ripgrep not found - file search will be slower. "),
            React.createElement(Text, { color: "gray" },
                "Install: ",
                getRipgrepInstallInstructions()))),
        React.createElement(Box, { borderColor: borderColor, borderStyle: "round", flexDirection: "row", marginTop: 1, paddingLeft: 1, paddingRight: 1, width: "100%" },
            React.createElement(Text, null, textInput),
            React.createElement(Text, { inverse: true }, " ")),
        React.createElement(Box, { justifyContent: "space-between", width: "100%" },
            React.createElement(Text, { color: "gray" }, modelId),
            React.createElement(Box, { gap: 1 },
                React.createElement(Box, null,
                    React.createElement(Text, { bold: mode === "plan", color: mode === "plan" ? "yellow" : "gray" },
                        mode === "plan" ? "●" : "○",
                        " Plan")),
                React.createElement(Box, null,
                    React.createElement(Text, { bold: mode === "act", color: mode === "act" ? "blue" : "gray" },
                        mode === "act" ? "●" : "○",
                        " Act")),
                React.createElement(Text, { color: "gray" }, "(Tab)"))),
        mentionInfo.inMentionMode && (React.createElement(FileMentionMenu, { isLoading: isSearching, query: mentionInfo.query, results: fileResults, selectedIndex: selectedIndex })),
        imagePaths.length > 0 && (React.createElement(Text, { color: "magenta" },
            "\uD83D\uDCCE ",
            imagePaths.length,
            " image",
            imagePaths.length > 1 ? "s" : "",
            " attached")),
        React.createElement(Box, null,
            React.createElement(Text, { color: "gray" }, "Enter to submit \u00B7 @ to mention files \u00B7 "),
            React.createElement(Text, { bold: escPressedOnce, color: escPressedOnce ? "white" : "gray" }, escPressedOnce ? "Press Esc again to exit" : "Esc to exit"))));
};
//# sourceMappingURL=WelcomeView.js.map