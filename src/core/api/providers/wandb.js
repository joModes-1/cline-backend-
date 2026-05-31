var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { openAiModelInfoSaneDefaults, wandbDefaultModelId, wandbModels } from "@shared/api";
import { createOpenAIClient } from "@/shared/net";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor";
export class WandbHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.wandbApiKey) {
                throw new Error("W&B API key is required");
            }
            try {
                this.client = createOpenAIClient({
                    baseURL: "https://api.inference.wandb.ai/v1",
                    apiKey: this.options.wandbApiKey,
                });
            }
            catch (error) {
                throw new Error(`Error creating W&B Inference client: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const model = this.getModel();
        const stream = await client.chat.completions.create({
            model: model.id,
            messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
            temperature: 0,
            stream: true,
            stream_options: { include_usage: true },
            ...getOpenAIToolParams(tools),
        });
        const toolCallProcessor = new ToolCallProcessor();
        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta;
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            if (delta && "reasoning" in delta && delta.reasoning) {
                yield {
                    type: "reasoning",
                    reasoning: typeof delta.reasoning === "string" ? delta.reasoning : JSON.stringify(delta.reasoning),
                };
            }
            if (delta?.tool_calls) {
                yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls);
            }
            if (chunk.usage) {
                // W&B Inference returns prompt_tokens_details.cached_tokens in the usage chunk,
                // but does not currently offer cache-aware billing (cached tokens are billed
                // at the same rate as regular input tokens). We report inputTokens as the full
                // prompt_tokens value and do not subtract cached tokens until W&B supports
                // cache-aware pricing. This may change in a future update.
                yield {
                    type: "usage",
                    inputTokens: chunk.usage.prompt_tokens || 0,
                    outputTokens: chunk.usage.completion_tokens || 0,
                };
            }
        }
    }
    getModel() {
        const modelId = this.options.apiModelId?.trim();
        if (modelId && modelId in wandbModels) {
            return { id: modelId, info: wandbModels[modelId] };
        }
        if (modelId) {
            return { id: modelId, info: openAiModelInfoSaneDefaults };
        }
        return { id: wandbDefaultModelId, info: wandbModels[wandbDefaultModelId] };
    }
}
__decorate([
    withRetry()
], WandbHandler.prototype, "createMessage", null);
//# sourceMappingURL=wandb.js.map