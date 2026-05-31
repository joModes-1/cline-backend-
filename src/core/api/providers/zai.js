var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { internationalZAiDefaultModelId, internationalZAiModels, mainlandZAiDefaultModelId, mainlandZAiModels, } from "@shared/api";
import { createOpenAIClient } from "@/shared/net";
import { version as extensionVersion } from "../../../../package.json";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor";
export class ZAiHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    useChinaApi() {
        return this.options.zaiApiLine === "china";
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.zaiApiKey) {
                throw new Error("Z AI API key is required");
            }
            try {
                this.client = createOpenAIClient({
                    baseURL: this.useChinaApi() ? "https://open.bigmodel.cn/api/paas/v4" : "https://api.z.ai/api/paas/v4",
                    apiKey: this.options.zaiApiKey,
                    defaultHeaders: {
                        "HTTP-Referer": "https://cline.bot",
                        "X-Title": "Cline",
                        "X-Cline-Version": extensionVersion,
                    },
                });
            }
            catch (error) {
                throw new Error(`Error creating Z AI client: ${error.message}`);
            }
        }
        return this.client;
    }
    getModel() {
        const modelId = this.options.apiModelId;
        if (this.useChinaApi()) {
            const id = modelId && modelId in mainlandZAiModels ? modelId : mainlandZAiDefaultModelId;
            return {
                id,
                info: mainlandZAiModels[id],
            };
        }
        const id = modelId && modelId in internationalZAiModels ? modelId : internationalZAiDefaultModelId;
        return {
            id,
            info: internationalZAiModels[id],
        };
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const model = this.getModel();
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        const stream = await client.chat.completions.create({
            model: model.id,
            max_completion_tokens: model.info.maxTokens,
            messages: openAiMessages,
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
            if (chunk.usage) {
                yield {
                    type: "usage",
                    inputTokens: chunk.usage.prompt_tokens || 0,
                    outputTokens: chunk.usage.completion_tokens || 0,
                    cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0,
                    cacheWriteTokens: 0,
                };
            }
        }
    }
}
__decorate([
    withRetry()
], ZAiHandler.prototype, "createMessage", null);
//# sourceMappingURL=zai.js.map