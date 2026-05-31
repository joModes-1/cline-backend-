/**
 * Provider picker component for API provider selection
 */
import React, { useMemo } from "react";
import { StateManager } from "@/core/storage/StateManager";
import { getProviderLabel, useValidProviders } from "../utils/providers";
import { SearchableList } from "./SearchableList";
// Re-export for backwards compatibility
export { getProviderLabel };
/**
 * Check if a provider is configured (has required credentials/settings)
 * Based on webview's getConfiguredProviders logic
 */
function isProviderConfigured(providerId, config) {
    switch (providerId) {
        case "cline":
            // Check if user has Cline API key or Cline account auth data stored
            return !!(config.clineApiKey ?? config["cline:clineAccountId"]);
        case "anthropic":
            return !!config.apiKey;
        case "openrouter":
            return !!config.openRouterApiKey;
        case "bedrock":
            return !!config.awsRegion;
        case "vertex":
            return !!(config.vertexProjectId && config.vertexRegion);
        case "gemini":
            return !!config.geminiApiKey;
        case "openai-native":
            return !!config.openAiNativeApiKey;
        case "openai-codex":
            // OpenAI Codex uses OAuth with credentials stored as JSON blob
            return !!config["openai-codex-oauth-credentials"];
        case "deepseek":
            return !!config.deepSeekApiKey;
        case "xai":
            return !!config.xaiApiKey;
        case "qwen":
        case "qwen-code":
            return !!config.qwenApiKey;
        case "doubao":
            return !!config.doubaoApiKey;
        case "mistral":
            return !!config.mistralApiKey;
        case "requesty":
            return !!config.requestyApiKey;
        case "fireworks":
            return !!config.fireworksApiKey;
        case "together":
            return !!config.togetherApiKey;
        case "moonshot":
            return !!config.moonshotApiKey;
        case "nebius":
            return !!config.nebiusApiKey;
        case "asksage":
            return !!config.asksageApiKey;
        case "sambanova":
            return !!config.sambanovaApiKey;
        case "cerebras":
            return !!config.cerebrasApiKey;
        case "sapaicore":
            return !!(config.sapAiCoreBaseUrl &&
                config.sapAiCoreClientId &&
                config.sapAiCoreClientSecret &&
                config.sapAiCoreTokenUrl);
        case "zai":
            return !!config.zaiApiKey;
        case "groq":
            return !!config.groqApiKey;
        case "huggingface":
            return !!config.huggingFaceApiKey;
        case "baseten":
            return !!config.basetenApiKey;
        case "dify":
            return !!(config.difyBaseUrl && config.difyApiKey);
        case "minimax":
            return !!config.minimaxApiKey;
        case "hicap":
            return !!config.hicapApiKey;
        case "huawei-cloud-maas":
            return !!config.huaweiCloudMaasApiKey;
        case "vercel-ai-gateway":
            return !!config.vercelAiGatewayApiKey;
        case "aihubmix":
            return !!config.aihubmixApiKey;
        case "nousResearch":
            return !!config.nousResearchApiKey;
        case "openai":
            return !!((config.openAiBaseUrl && config.openAiApiKey) ||
                config.planModeOpenAiModelId ||
                config.actModeOpenAiModelId);
        case "ollama":
            return !!(config.ollamaBaseUrl || config.planModeOllamaModelId || config.actModeOllamaModelId);
        case "lmstudio":
            return !!(config.lmStudioBaseUrl || config.planModeLmStudioModelId || config.actModeLmStudioModelId);
        case "litellm":
            return !!(config.liteLlmBaseUrl ||
                config.liteLlmApiKey ||
                config.planModeLiteLlmModelId ||
                config.actModeLiteLlmModelId);
        case "claude-code":
            return !!config.claudeCodePath;
        case "oca":
            return !!config.ocaBaseUrl;
        default:
            return false;
    }
}
export const ProviderPicker = ({ onSelect, isActive = true }) => {
    // Get API configuration to check which providers are configured
    const apiConfig = StateManager.get().getApiConfiguration();
    const sorted = useValidProviders();
    // Use providers.json order, filtered to exclude CLI-incompatible providers
    const items = useMemo(() => {
        return sorted.map((providerId) => ({
            id: providerId,
            label: getProviderLabel(providerId),
            suffix: isProviderConfigured(providerId, apiConfig) ? "(Configured)" : undefined,
        }));
    }, [apiConfig, sorted]);
    return React.createElement(SearchableList, { isActive: isActive, items: items, onSelect: (item) => onSelect(item.id) });
};
//# sourceMappingURL=ProviderPicker.js.map