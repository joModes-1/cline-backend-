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
import { convertToR1Format } from "../transform/r1-format";
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor";
export class TogetherHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.togetherApiKey) {
                throw new Error("Together API key is required");
            }
            try {
                this.client = createOpenAIClient({
                    baseURL: "https://api.together.xyz/v1",
                    apiKey: this.options.togetherApiKey,
                });
            }
            catch (error) {
                throw new Error(`Error creating Together client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const modelId = this.options.togetherModelId ?? "";
        const isDeepseekReasoner = modelId.includes("deepseek-reasoner");
        let openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        if (isDeepseekReasoner) {
            openAiMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages]);
        }
        const stream = await client.chat.completions.create({
            model: modelId,
            messages: openAiMessages,
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
            if (delta?.tool_calls) {
                yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls);
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
                };
            }
        }
    }
    getModel() {
        return {
            id: this.options.togetherModelId ?? "",
            info: openAiModelInfoSaneDefaults,
        };
    }
}
__decorate([
    withRetry()
], TogetherHandler.prototype, "createMessage", null);
//# sourceMappingURL=together.js.map