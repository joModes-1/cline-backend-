var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { openAiModelInfoSaneDefaults } from "@shared/api";
import { createOpenAIClient } from "@/shared/net";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor";
export class LmStudioHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            try {
                this.client = createOpenAIClient({
                    // Docs on the new v0 api endpoint: https://lmstudio.ai/docs/app/api/endpoints/rest
                    baseURL: new URL("api/v0", this.options.lmStudioBaseUrl || "http://localhost:1234").toString(),
                    apiKey: "noop",
                });
            }
            catch (error) {
                throw new Error(`Error creating LM Studio client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        try {
            const stream = await client.chat.completions.create({
                model: this.getModel().id,
                messages: openAiMessages,
                stream: true,
                stream_options: { include_usage: true },
                max_completion_tokens: this.options.lmStudioMaxTokens ? Number(this.options.lmStudioMaxTokens) : undefined,
                ...getOpenAIToolParams(tools),
            });
            const toolCallProcessor = new ToolCallProcessor();
            for await (const chunk of stream) {
                const choice = chunk.choices?.[0];
                const delta = choice?.delta;
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
                if (delta?.tool_calls) {
                    yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls);
                }
                if (chunk.usage) {
                    yield {
                        type: "usage",
                        inputTokens: chunk.usage.prompt_tokens || 0,
                        outputTokens: chunk.usage.completion_tokens || 0,
                        cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0,
                    };
                }
            }
        }
        catch {
            // LM Studio doesn't return an error code/body for now
            throw new Error("Please check the LM Studio developer logs to debug what went wrong. You may need to load the model with a larger context length to work with Cline's prompts. Alternatively, try enabling Compact Prompt in your settings when working with a limited context window.");
        }
    }
    getModel() {
        const info = { ...openAiModelInfoSaneDefaults };
        const maxTokens = Number(this.options.lmStudioMaxTokens);
        if (!Number.isNaN(maxTokens)) {
            info.contextWindow = maxTokens;
        }
        return {
            id: this.options.lmStudioModelId || "",
            info,
        };
    }
}
__decorate([
    withRetry({ retryAllErrors: true })
], LmStudioHandler.prototype, "createMessage", null);
//# sourceMappingURL=lmstudio.js.map