var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { basetenDefaultModelId, basetenModels } from "@shared/api";
import { calculateApiCostOpenAI } from "@utils/cost";
import OpenAI from "openai";
import { buildExternalBasicHeaders } from "@/services/EnvUtils";
import { fetch } from "@/shared/net";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { ToolCallProcessor } from "../transform/tool-call-processor";
export class BasetenHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.basetenApiKey) {
                throw new Error("Baseten API key is required");
            }
            try {
                this.client = new OpenAI({
                    baseURL: "https://inference.baseten.co/v1",
                    apiKey: this.options.basetenApiKey,
                    defaultHeaders: buildExternalBasicHeaders(),
                    fetch, // Use configured fetch with proxy support
                });
            }
            catch (error) {
                throw new Error(`Error creating Baseten client: ${error.message}`);
            }
        }
        return this.client;
    }
    /**
     * Gets the optimal max_tokens based on model capabilities
     */
    getOptimalMaxTokens(model) {
        // Use model-specific max tokens if available
        if (model.info.maxTokens && model.info.maxTokens > 0) {
            return model.info.maxTokens;
        }
        // Default fallback
        return 8192;
    }
    getModel() {
        // First priority: basetenModelId and basetenModelInfo
        const basetenModelId = this.options.basetenModelId;
        const basetenModelInfo = this.options.basetenModelInfo;
        if (basetenModelId && basetenModelInfo) {
            return { id: basetenModelId, info: basetenModelInfo };
        }
        // Second priority: basetenModelId with static model info
        if (basetenModelId && basetenModelId in basetenModels) {
            const id = basetenModelId;
            return { id, info: basetenModels[id] };
        }
        // Third priority: apiModelId (for backward compatibility)
        const apiModelId = this.options.apiModelId;
        if (apiModelId && apiModelId in basetenModels) {
            const id = apiModelId;
            return { id, info: basetenModels[id] };
        }
        // Default fallback
        return {
            id: basetenDefaultModelId,
            info: basetenModels[basetenDefaultModelId],
        };
    }
    async *yieldUsage(modelInfo, usage) {
        if (usage.prompt_tokens || usage.completion_tokens) {
            const cost = calculateApiCostOpenAI(modelInfo, usage.prompt_tokens || 0, usage.completion_tokens || 0);
            yield {
                type: "usage",
                inputTokens: usage.prompt_tokens || 0,
                outputTokens: usage.completion_tokens || 0,
                cacheWriteTokens: 0,
                cacheReadTokens: 0,
                totalCost: cost,
            };
        }
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const model = this.getModel();
        const maxTokens = this.getOptimalMaxTokens(model);
        const toolCallProcessor = new ToolCallProcessor();
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        const stream = await client.chat.completions.create({
            model: model.id,
            max_tokens: maxTokens,
            messages: openAiMessages,
            stream: true,
            stream_options: { include_usage: true },
            temperature: 0,
            tools,
            tool_choice: tools && tools.length > 0 ? "auto" : undefined,
        });
        let didOutputUsage = false;
        for await (const chunk of stream) {
            const delta = chunk?.choices?.[0]?.delta;
            // Handle reasoning field if present (for reasoning models with parsed output)
            if (delta && "reasoning" in delta && delta?.reasoning) {
                const reasoning = typeof delta.reasoning === "string" ? delta.reasoning : JSON.stringify(delta.reasoning);
                yield {
                    type: "reasoning",
                    reasoning,
                };
            }
            // Handle content field
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            if (delta?.tool_calls) {
                yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls);
            }
            // Handle usage information - only output once
            if (!didOutputUsage && chunk.usage) {
                yield* this.yieldUsage(model.info, chunk.usage);
                didOutputUsage = true;
            }
        }
    }
    /**
     * Checks if the current model supports tools
     */
    supportsTools() {
        const model = this.getModel();
        const modelInfo = model.info;
        // Use dynamic API data when available, fallback to true since all current Baseten models support tools
        // (as of 2025-09-16 - could change if Baseten add non-tool models in future, currently no plans to do so)
        return modelInfo.supportedFeatures ? modelInfo.supportedFeatures.includes("tools") : true;
    }
}
__decorate([
    withRetry()
], BasetenHandler.prototype, "createMessage", null);
//# sourceMappingURL=baseten.js.map