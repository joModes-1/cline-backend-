/**
 * Model picker component for model selection
 * Supports static model lists and async loading for OpenRouter
 */
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import React, { useEffect, useMemo, useState } from "react";
import { refreshOcaModels } from "@/core/controller/models/refreshOcaModels";
import { refreshOpenRouterModels } from "@/core/controller/models/refreshOpenRouterModels";
import { anthropicDefaultModelId, anthropicModels, askSageDefaultModelId, askSageModels, basetenDefaultModelId, basetenModels, bedrockDefaultModelId, bedrockModels, cerebrasDefaultModelId, cerebrasModels, claudeCodeDefaultModelId, claudeCodeModels, deepSeekDefaultModelId, deepSeekModels, doubaoDefaultModelId, doubaoModels, fireworksDefaultModelId, fireworksModels, geminiDefaultModelId, geminiModels, groqDefaultModelId, groqModels, huaweiCloudMaasDefaultModelId, huaweiCloudMaasModels, huggingFaceDefaultModelId, huggingFaceModels, internationalQwenDefaultModelId, internationalQwenModels, internationalZAiDefaultModelId, internationalZAiModels, minimaxDefaultModelId, minimaxModels, mistralDefaultModelId, mistralModels, moonshotDefaultModelId, moonshotModels, nebiusDefaultModelId, nebiusModels, nousResearchDefaultModelId, nousResearchModels, openAiCodexDefaultModelId, openAiCodexModels, openAiNativeDefaultModelId, openAiNativeModels, qwenCodeDefaultModelId, qwenCodeModels, sambanovaDefaultModelId, sambanovaModels, sapAiCoreDefaultModelId, sapAiCoreModels, vertexDefaultModelId, vertexModels, wandbDefaultModelId, wandbModels, xaiDefaultModelId, xaiModels, } from "@/shared/api";
import { StringRequest } from "@/shared/proto/cline/common";
import { filterOpenRouterModelIds } from "@/shared/utils/model-filters";
import { COLORS } from "../constants/colors";
import { getOpenRouterDefaultModelId, usesOpenRouterModels } from "../utils/openrouter-models";
import { SearchableList } from "./SearchableList";
// Special ID used to indicate the user wants to enter a custom model ID / ARN
export const CUSTOM_MODEL_ID = "__custom__";
// Map providers to their static model lists and defaults
export const providerModels = {
    anthropic: { models: anthropicModels, defaultId: anthropicDefaultModelId },
    asksage: { models: askSageModels, defaultId: askSageDefaultModelId },
    baseten: { models: basetenModels, defaultId: basetenDefaultModelId },
    bedrock: { models: bedrockModels, defaultId: bedrockDefaultModelId },
    cerebras: { models: cerebrasModels, defaultId: cerebrasDefaultModelId },
    "claude-code": { models: claudeCodeModels, defaultId: claudeCodeDefaultModelId },
    deepseek: { models: deepSeekModels, defaultId: deepSeekDefaultModelId },
    doubao: { models: doubaoModels, defaultId: doubaoDefaultModelId },
    fireworks: { models: fireworksModels, defaultId: fireworksDefaultModelId },
    gemini: { models: geminiModels, defaultId: geminiDefaultModelId },
    groq: { models: groqModels, defaultId: groqDefaultModelId },
    "huawei-cloud-maas": { models: huaweiCloudMaasModels, defaultId: huaweiCloudMaasDefaultModelId },
    huggingface: { models: huggingFaceModels, defaultId: huggingFaceDefaultModelId },
    minimax: { models: minimaxModels, defaultId: minimaxDefaultModelId },
    mistral: { models: mistralModels, defaultId: mistralDefaultModelId },
    moonshot: { models: moonshotModels, defaultId: moonshotDefaultModelId },
    nebius: { models: nebiusModels, defaultId: nebiusDefaultModelId },
    nousResearch: { models: nousResearchModels, defaultId: nousResearchDefaultModelId },
    "openai-codex": { models: openAiCodexModels, defaultId: openAiCodexDefaultModelId },
    "openai-native": { models: openAiNativeModels, defaultId: openAiNativeDefaultModelId },
    qwen: { models: internationalQwenModels, defaultId: internationalQwenDefaultModelId },
    "qwen-code": { models: qwenCodeModels, defaultId: qwenCodeDefaultModelId },
    sambanova: { models: sambanovaModels, defaultId: sambanovaDefaultModelId },
    sapaicore: { models: sapAiCoreModels, defaultId: sapAiCoreDefaultModelId },
    vertex: { models: vertexModels, defaultId: vertexDefaultModelId },
    wandb: { models: wandbModels, defaultId: wandbDefaultModelId },
    xai: { models: xaiModels, defaultId: xaiDefaultModelId },
    zai: { models: internationalZAiModels, defaultId: internationalZAiDefaultModelId },
};
export function hasStaticModels(provider) {
    return provider in providerModels;
}
export function hasModelPicker(provider) {
    return hasStaticModels(provider) || usesOpenRouterModels(provider) || provider === "oca";
}
export function getDefaultModelId(provider) {
    if (usesOpenRouterModels(provider)) {
        return getOpenRouterDefaultModelId();
    }
    return providerModels[provider]?.defaultId || "";
}
export function getModelList(provider) {
    if (!hasStaticModels(provider))
        return [];
    return Object.keys(providerModels[provider].models);
}
export const ModelPicker = ({ provider, controller, onChange, onSubmit, isActive = true }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [asyncModels, setAsyncModels] = useState([]);
    // Fetch async models (OpenRouter or OCA) when needed
    useEffect(() => {
        if (usesOpenRouterModels(provider)) {
            setIsLoading(true);
            refreshOpenRouterModels(controller)
                .then((models) => {
                const modelIds = Object.keys(models).sort((a, b) => a.localeCompare(b));
                const filtered = filterOpenRouterModelIds(modelIds, provider);
                setAsyncModels(filtered);
            })
                .finally(() => {
                setIsLoading(false);
            });
        }
        else if (provider === "oca") {
            setIsLoading(true);
            refreshOcaModels(controller, StringRequest.create({ value: "" }))
                .then((result) => {
                if (result.models) {
                    const modelIds = Object.keys(result.models).sort((a, b) => a.localeCompare(b));
                    setAsyncModels(modelIds);
                }
            })
                .finally(() => {
                setIsLoading(false);
            });
        }
    }, [provider, controller]);
    const modelList = useMemo(() => {
        if (usesOpenRouterModels(provider) || provider === "oca") {
            return asyncModels;
        }
        return getModelList(provider);
    }, [provider, asyncModels]);
    // Providers that support custom model IDs (e.g., Bedrock Application Inference Profiles)
    const supportsCustomModel = provider === "bedrock";
    const items = useMemo(() => {
        const list = modelList.map((modelId) => ({
            id: modelId,
            label: modelId,
        }));
        // Add "Custom" option at the end for providers that support it
        if (supportsCustomModel) {
            list.push({
                id: CUSTOM_MODEL_ID,
                label: "Custom (ARN / Inference Profile)",
            });
        }
        return list;
    }, [modelList, supportsCustomModel]);
    // For providers without a model picker, render nothing
    if (!hasModelPicker(provider)) {
        return null;
    }
    // Show loading state for async providers
    if (isLoading) {
        return (React.createElement(Box, null,
            React.createElement(Text, { color: COLORS.primaryBlue },
                React.createElement(Spinner, { type: "dots" })),
            React.createElement(Text, { color: "gray" }, " Loading models...")));
    }
    // If async fetch returned no models, render nothing
    if ((usesOpenRouterModels(provider) || provider === "oca") && modelList.length === 0) {
        return null;
    }
    return (React.createElement(SearchableList, { isActive: isActive, items: items, onSelect: (item) => {
            onChange(item.id);
            onSubmit(item.id);
        } }));
};
//# sourceMappingURL=ModelPicker.js.map