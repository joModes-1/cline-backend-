/**
 * Bedrock Custom Model Flow component
 * Two-step flow: ARN/custom model ID input → base model selection for capability detection.
 * Used by both AuthView (onboarding) and SettingsPanelContent (/settings).
 */
import { Box, Text, useInput } from "ink";
// biome-ignore lint/correctness/noUnusedImports: React is needed for JSX at runtime
import React, { useCallback, useState } from "react";
import { COLORS } from "../constants/colors";
import { useStdinContext } from "../context/StdinContext";
import { isEnterKey } from "../utils/input";
import { getModelList } from "./ModelPicker";
import { SearchableList } from "./SearchableList";
export const BedrockCustomModelFlow = ({ isActive, onComplete, onCancel }) => {
    const { isRawModeSupported } = useStdinContext();
    const [step, setStep] = useState("arn_input");
    const [customArn, setCustomArn] = useState("");
    const handleArnSubmit = useCallback(() => {
        if (customArn.trim()) {
            setStep("base_model");
        }
    }, [customArn]);
    const handleBaseModelCancel = useCallback(() => {
        setStep("arn_input");
    }, []);
    useInput((input, key) => {
        if (step === "arn_input") {
            if (key.escape) {
                onCancel();
            }
            else if (isEnterKey(input, key)) {
                handleArnSubmit();
            }
            else if (key.backspace || key.delete) {
                setCustomArn((prev) => prev.slice(0, -1));
            }
            else if (input && !key.ctrl && !key.meta) {
                setCustomArn((prev) => prev + input);
            }
            return;
        }
        if (step === "base_model") {
            if (key.escape) {
                handleBaseModelCancel();
            }
            // Other input is handled by SearchableList
        }
    }, { isActive: isActive && isRawModeSupported });
    if (step === "arn_input") {
        return (React.createElement(Box, { flexDirection: "column" },
            React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, "Custom Model ID"),
            React.createElement(Box, { marginTop: 1 },
                React.createElement(Text, { color: "gray" }, "Enter your Application Inference Profile ARN or custom model ID")),
            React.createElement(Box, { marginTop: 1 },
                customArn ? (React.createElement(Text, { color: "white" }, customArn)) : (React.createElement(Text, { color: "gray" }, "e.g. arn:aws:bedrock:region:account:application-inference-profile/...")),
                React.createElement(Text, { inverse: true }, " ")),
            React.createElement(Box, { marginTop: 1 },
                React.createElement(Text, { color: "gray" }, "Enter to continue, Esc to go back"))));
    }
    // step === "base_model"
    return (React.createElement(Box, { flexDirection: "column" },
        React.createElement(Text, { bold: true, color: COLORS.primaryBlue }, "Base Inference Model"),
        React.createElement(Text, { color: "gray" }, "Select the base model your inference profile uses (for capability detection)"),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(SearchableList, { isActive: isActive && step === "base_model", items: getModelList("bedrock").map((id) => ({ id, label: id })), onSelect: (item) => {
                    onComplete(customArn, item.id);
                } })),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { color: "gray" }, "Type to search, arrows to navigate, Enter to select, Esc to go back"))));
};
//# sourceMappingURL=BedrockCustomModelFlow.js.map