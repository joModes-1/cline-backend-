/**
 * Import view component
 * Handles importing API keys from competing CLI agents (Codex, OpenCode)
 */
import { Box, Text, useInput } from "ink";
import React, { useCallback, useEffect, useState } from "react";
import { StateManager } from "@/core/storage/StateManager";
import { COLORS } from "../constants/colors";
import { useStdinContext } from "../context/StdinContext";
import { getProviderDisplayName, getSourceDisplayName, importFromCodex, importFromOpenCode, } from "../utils/import-configs";
import { isEnterKey } from "../utils/input";
import { applyProviderConfig } from "../utils/provider-config";
export const ImportView = ({ source, onComplete, onCancel }) => {
    const { isRawModeSupported } = useStdinContext();
    const [step, setStep] = useState("select");
    const [keys, setKeys] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [confirmIndex, setConfirmIndex] = useState(0);
    const [errorMessage, setErrorMessage] = useState("");
    // Load keys on mount
    useEffect(() => {
        const result = source === "codex" ? importFromCodex() : importFromOpenCode();
        if (result && result.keys.length > 0) {
            setKeys(result.keys);
            if (result.keys.length === 1) {
                // Only one key, go straight to confirm
                setStep("confirm");
            }
        }
        else {
            setErrorMessage(`Could not read API keys from ${getSourceDisplayName(source)} config`);
            setStep("error");
        }
    }, [source]);
    const handleConfirm = useCallback(async () => {
        try {
            setStep("saving");
            const selectedKey = keys[selectedIndex];
            if (!selectedKey) {
                setErrorMessage("No key selected");
                setStep("error");
                return;
            }
            await applyProviderConfig({
                providerId: selectedKey.provider,
                apiKey: selectedKey.key,
                modelId: selectedKey.modelId,
            });
            const stateManager = StateManager.get();
            stateManager.setGlobalState("welcomeViewCompleted", true);
            await stateManager.flushPendingState();
            onComplete();
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setStep("error");
        }
    }, [keys, selectedIndex, onComplete]);
    useInput((input, key) => {
        if (key.escape) {
            if (step === "confirm" && keys.length > 1) {
                setStep("select");
                setConfirmIndex(0);
            }
            else if (step === "error") {
                onCancel();
            }
            else {
                onCancel();
            }
            return;
        }
        if (step === "select") {
            if (key.upArrow) {
                setSelectedIndex((prev) => (prev > 0 ? prev - 1 : keys.length - 1));
            }
            else if (key.downArrow) {
                setSelectedIndex((prev) => (prev < keys.length - 1 ? prev + 1 : 0));
            }
            else if (isEnterKey(input, key)) {
                setStep("confirm");
            }
        }
        else if (step === "confirm") {
            if (key.upArrow || key.downArrow) {
                setConfirmIndex((prev) => (prev === 0 ? 1 : 0));
            }
            else if (isEnterKey(input, key)) {
                if (confirmIndex === 0) {
                    handleConfirm();
                }
                else {
                    onCancel();
                }
            }
        }
        else if (step === "error") {
            if (isEnterKey(input, key)) {
                onCancel();
            }
        }
    }, { isActive: isRawModeSupported && step !== "saving" });
    const sourceName = getSourceDisplayName(source);
    if (step === "select") {
        return (React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { color: "white" },
                "Select which key to import from ",
                sourceName),
            React.createElement(Text, null, " "),
            keys.map((k, i) => (React.createElement(Box, { key: `${k.provider}-${i}` },
                React.createElement(Text, { color: i === selectedIndex ? COLORS.primaryBlue : undefined },
                    i === selectedIndex ? "❯ " : "  ",
                    getProviderDisplayName(k.provider))))),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: "gray" }, "Arrows to navigate, Enter to select, Esc to go back")));
    }
    if (step === "confirm") {
        const selectedKey = keys[selectedIndex];
        const providerName = selectedKey ? getProviderDisplayName(selectedKey.provider) : "";
        const maskedKey = selectedKey ? `${selectedKey.key.slice(0, 8)}...${selectedKey.key.slice(-4)}` : "";
        return (React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { color: "white" },
                "Import API key from ",
                sourceName,
                "?"),
            React.createElement(Text, null, " "),
            React.createElement(Box, null,
                React.createElement(Text, { color: "gray" }, "Provider: "),
                React.createElement(Text, { color: "white" }, providerName)),
            React.createElement(Box, null,
                React.createElement(Text, { color: "gray" }, "API Key: "),
                React.createElement(Text, { color: "white" }, maskedKey)),
            selectedKey?.modelId && (React.createElement(Box, null,
                React.createElement(Text, { color: "gray" }, "Model: "),
                React.createElement(Text, { color: "white" }, selectedKey.modelId))),
            React.createElement(Text, null, " "),
            React.createElement(Box, null,
                React.createElement(Text, { color: confirmIndex === 0 ? COLORS.primaryBlue : undefined },
                    confirmIndex === 0 ? "❯ " : "  ",
                    "Confirm import")),
            React.createElement(Box, null,
                React.createElement(Text, { color: confirmIndex === 1 ? COLORS.primaryBlue : undefined },
                    confirmIndex === 1 ? "❯ " : "  ",
                    "Cancel")),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: "gray" }, "Enter to confirm, Esc to go back")));
    }
    if (step === "saving") {
        return (React.createElement(Box, null,
            React.createElement(Text, { color: "white" }, "Importing configuration...")));
    }
    if (step === "error") {
        return (React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { bold: true, color: "red" }, "Something went wrong"),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: "yellow" }, errorMessage),
            React.createElement(Text, null, " "),
            React.createElement(Text, { color: "gray" }, "Press Enter or Esc to go back")));
    }
    return null;
};
//# sourceMappingURL=ImportView.js.map