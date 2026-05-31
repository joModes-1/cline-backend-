var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { liteLlmDefaultModelId, liteLlmModelInfoSaneDefaults } from "@shared/api";
import { StateManager } from "@/core/storage/StateManager";
import { buildExternalBasicHeaders } from "@/services/EnvUtils";
import { createOpenAIClient, fetch } from "@/shared/net";
import { Logger } from "@/shared/services/Logger";
import { isAnthropicModelId } from "@/utils/model-utils";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
/**
 * Exported utility function to fetch LiteLLM model info
 * @param baseUrl The base URL for the LiteLLM API
 * @param apiKey The API key for authentication
 * @returns The model info response or undefined if fetch fails
 */
export async function fetchLiteLlmModelsInfo(baseUrl, apiKey) {
    // Handle base URLs that already include /v1 to avoid double /v1/v1/
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    const url = `${normalizedBaseUrl}/model/info`;
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                accept: "application/json",
                "x-litellm-api-key": apiKey,
                ...buildExternalBasicHeaders(),
            },
        });
        if (response.ok) {
            const data = await response.json();
            return data;
        }
        Logger.error("Failed to fetch LiteLLM model info:", response.statusText);
        // Try with Authorization header instead
        const retryResponse = await fetch(url, {
            method: "GET",
            headers: {
                accept: "application/json",
                Authorization: `Bearer ${apiKey}`,
                ...buildExternalBasicHeaders(),
            },
        });
        if (retryResponse.ok) {
            const data = await retryResponse.json();
            return data;
        }
        Logger.error("Failed to fetch LiteLLM model info with Authorization header:", retryResponse.statusText);
        throw new Error(`Failed to fetch LiteLLM model info: ${retryResponse.statusText}`);
    }
    catch (error) {
        Logger.error("Error fetching LiteLLM model info:", error);
        throw error;
    }
}
export class LiteLlmHandler {
    options;
    client;
    modelInfoCache;
    modelInfoCacheTimestamp = 0;
    modelInfoCacheTTL = 5 * 60 * 1000; // 5 minutes
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.liteLlmApiKey) {
                throw new Error("LiteLLM API key is required");
            }
            try {
                this.client = createOpenAIClient({
                    baseURL: this.options.liteLlmBaseUrl || "http://localhost:4000",
                    apiKey: this.options.liteLlmApiKey || "noop",
                });
            }
            catch (error) {
                throw new Error(`Error creating LiteLLM client: ${error.message}`);
            }
        }
        return this.client;
    }
    async modelInfo(publicModelName) {
        const modelInfo = await this.fetchModelsInfo();
        if (!modelInfo?.data) {
            return undefined;
        }
        return modelInfo.data.find((model) => model.model_name === publicModelName);
    }
    async fetchModelsInfo() {
        // Check if cache is still valid
        const now = Date.now();
        if (this.modelInfoCache && now - this.modelInfoCacheTimestamp < this.modelInfoCacheTTL) {
            return this.modelInfoCache;
        }
        const client = this.ensureClient();
        const data = await fetchLiteLlmModelsInfo(client.baseURL, this.options.liteLlmApiKey || "");
        if (data) {
            this.modelInfoCache = data;
            this.modelInfoCacheTimestamp = now;
        }
        return data;
    }
    async getModelCostInfo(publicModelName) {
        try {
            const matchingModel = await this.modelInfo(publicModelName);
            if (matchingModel) {
                return {
                    inputCostPerToken: matchingModel.model_info.input_cost_per_token || 0,
                    outputCostPerToken: matchingModel.model_info.output_cost_per_token || 0,
                    cacheCreationCostPerToken: matchingModel.model_info.cache_creation_input_token_cost,
                    cacheReadCostPerToken: matchingModel.model_info.cache_read_input_token_cost,
                };
            }
        }
        catch (error) {
            Logger.warn("Error getting LiteLLM model cost info:", error);
        }
        // Fallback to zero costs if we can't get the information
        return {
            inputCostPerToken: 0,
            outputCostPerToken: 0,
        };
    }
    async calculateCost(prompt_tokens, completion_tokens, cache_creation_tokens, cache_read_tokens) {
        const publicModelId = this.options.liteLlmModelId || liteLlmDefaultModelId;
        try {
            const costInfo = await this.getModelCostInfo(publicModelId);
            // Calculate costs for different token types
            const inputCost = Math.max(0, prompt_tokens - (cache_read_tokens || 0)) * costInfo.inputCostPerToken;
            const outputCost = completion_tokens * costInfo.outputCostPerToken;
            const cacheCreationCost = (cache_creation_tokens || 0) * (costInfo.cacheCreationCostPerToken || 0);
            const cacheReadCost = (cache_read_tokens || 0) * (costInfo.cacheReadCostPerToken || 0);
            const totalCost = inputCost + outputCost + cacheCreationCost + cacheReadCost;
            return totalCost;
        }
        catch (error) {
            Logger.error("Error calculating spend:", error);
            return undefined;
        }
    }
    async *createMessage(systemPrompt, messages) {
        const client = this.ensureClient();
        const formattedMessages = convertToOpenAiMessages(messages);
        const systemMessage = {
            role: "system",
            content: systemPrompt,
        };
        const modelId = this.options.liteLlmModelId || liteLlmDefaultModelId;
        const isOminiModel = modelId.includes("o1-mini") || modelId.includes("o3-mini") || modelId.includes("o4-mini");
        const isCodexModel = modelId.toLowerCase().includes("codex");
        // Configuration for extended thinking
        const budgetTokens = this.options.thinkingBudgetTokens || 0;
        const reasoningOn = budgetTokens !== 0;
        const thinkingConfig = reasoningOn ? { type: "enabled", budget_tokens: budgetTokens } : undefined;
        let temperature = this.options.liteLlmModelInfo?.temperature ?? 1;
        if ((isOminiModel || isAnthropicModelId(modelId)) && reasoningOn) {
            temperature = undefined; // OAI omni and Anthropic extended thinking mode doesn't support temperature
        }
        const modelInfo = await this.modelInfo(modelId);
        // Automatically enable caching if the model supports it
        const cacheControl = (modelInfo?.model_info.supports_prompt_caching ?? false) ? { cache_control: { type: "ephemeral" } } : undefined;
        if (cacheControl) {
            // Add cache_control to system message if enabled
            // https://docs.litellm.ai/docs/providers/anthropic#caching---large-context-caching
            systemMessage.content = [
                {
                    text: systemPrompt,
                    type: "text",
                    ...cacheControl,
                },
            ];
        }
        // Find the last two user messages to apply caching
        const userMsgIndices = formattedMessages.reduce((acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc), []);
        const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1;
        const secondLastUserMsgIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1;
        // Apply cache_control to the last two user messages if enabled
        // https://docs.litellm.ai/docs/providers/anthropic#caching---large-context-caching
        const enhancedMessages = formattedMessages.map((message, index) => {
            if ((index === lastUserMsgIndex || index === secondLastUserMsgIndex) && cacheControl) {
                // Handle both string and array content types
                if (typeof message.content === "string") {
                    return {
                        ...message,
                        content: [
                            {
                                type: "text",
                                text: message.content,
                                ...cacheControl,
                            },
                        ],
                    };
                }
                if (Array.isArray(message.content)) {
                    // Apply cache control to the last content item in the array
                    return {
                        ...message,
                        content: message.content.map((item, contentIndex) => contentIndex === (message.content?.length || 0) - 1
                            ? {
                                ...item,
                                ...cacheControl,
                            }
                            : item),
                    };
                }
                return {
                    ...message,
                    ...cacheControl,
                };
            }
            return message;
        });
        const stream = await client.chat.completions.create({
            model: this.options.liteLlmModelId || liteLlmDefaultModelId,
            messages: [systemMessage, ...enhancedMessages],
            temperature,
            stream: true,
            drop_params: true,
            ...(!isCodexModel && { stream_options: { include_usage: true } }), // Codex models are only on the responses api, which doesn't take the stream_options parameter. we will need to migrate to the responses api for this to work
            ...(thinkingConfig && { thinking: thinkingConfig }), // Add thinking configuration when applicable
            ...(this.options.ulid && { litellm_session_id: `cline-${this.options.ulid}` }), // Add session ID for LiteLLM tracking
        });
        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta;
            // Handle normal text content
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            if (delta?.reasoning_content) {
                yield {
                    type: "reasoning",
                    reasoning: delta.reasoning_content || "",
                };
            }
            // Handle token usage information
            if (chunk.usage) {
                // Extract cache-related information if available
                // Need to use type assertion since these properties are not in the standard OpenAI types
                const usage = chunk.usage;
                const cacheWriteTokens = usage.cache_creation_input_tokens || usage.prompt_cache_miss_tokens || 0;
                const cacheReadTokens = usage.cache_read_input_tokens || usage.prompt_cache_hit_tokens || 0;
                // Calculate cost using the actual token usage including cache tokens
                const totalCost = (await this.calculateCost(usage.prompt_tokens || 0, usage.completion_tokens || 0, cacheWriteTokens > 0 ? cacheWriteTokens : undefined, cacheReadTokens > 0 ? cacheReadTokens : undefined)) || 0;
                yield {
                    type: "usage",
                    inputTokens: usage.prompt_tokens || 0,
                    outputTokens: usage.completion_tokens || 0,
                    cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
                    cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
                    totalCost,
                };
            }
        }
    }
    getModel() {
        const modelId = this.options.liteLlmModelId || liteLlmDefaultModelId;
        // Try to get model info from StateManager cache first
        const cachedModelInfo = StateManager.get().getModelInfo("liteLlm", modelId);
        // Fall back to provided model info or defaults if not in cache
        const modelInfo = cachedModelInfo || this.options.liteLlmModelInfo || liteLlmModelInfoSaneDefaults;
        return {
            id: modelId,
            info: modelInfo,
        };
    }
}
__decorate([
    withRetry()
], LiteLlmHandler.prototype, "createMessage", null);
//# sourceMappingURL=litellm.js.map