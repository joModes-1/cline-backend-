var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { hicapModelInfoSaneDefaults } from "@shared/api";
import { createOpenAIClient } from "@/shared/net";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
export class HicapHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.hicapApiKey) {
                throw new Error("Hicap API key is required");
            }
            if (!this.options.hicapModelId) {
                throw new Error("Model ID is required");
            }
            try {
                this.client = createOpenAIClient({
                    baseURL: "https://api.hicap.ai/v2/openai",
                    apiKey: this.options.hicapApiKey,
                    defaultHeaders: {
                        "api-key": this.options.hicapApiKey,
                    },
                });
            }
            catch (error) {
                throw new Error(`Error creating OpenAI client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages) {
        const client = this.ensureClient();
        const modelId = this.options.hicapModelId ?? "";
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        const temperature = 1;
        let reasoningEffort;
        let maxTokens;
        const stream = await client.chat.completions.create({
            model: modelId,
            messages: openAiMessages,
            temperature,
            max_tokens: maxTokens,
            reasoning_effort: reasoningEffort,
            stream: true,
            stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            if (delta && "reasoning_content" in delta && delta.reasoning_content) {
                yield {
                    type: "reasoning",
                    reasoning: delta.reasoning_content || "",
                };
            }
            if (chunk.usage) {
                yield {
                    type: "usage",
                    inputTokens: chunk.usage.prompt_tokens || 0,
                    outputTokens: chunk.usage.completion_tokens || 0,
                    cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0,
                    // @ts-expect-error-next-line
                    cacheWriteTokens: chunk.usage.prompt_cache_miss_tokens || 0,
                };
            }
        }
    }
    getModel() {
        return {
            id: this.options.hicapModelId ?? "",
            info: hicapModelInfoSaneDefaults,
        };
    }
}
__decorate([
    withRetry()
], HicapHandler.prototype, "createMessage", null);
//# sourceMappingURL=hicap.js.map