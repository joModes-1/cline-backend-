var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { nousResearchDefaultModelId, nousResearchModels } from "@shared/api";
import { createOpenAIClient } from "@/shared/net";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
export class NousResearchHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.nousResearchApiKey) {
                throw new Error("NousResearch API key is required");
            }
            try {
                this.client = createOpenAIClient({
                    baseURL: "https://inference-api.nousResearch.com/v1",
                    apiKey: this.options.nousResearchApiKey,
                });
            }
            catch (error) {
                throw new Error(`Error creating NousResearch client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages) {
        const client = this.ensureClient();
        const model = this.getModel();
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        const stream = await client.chat.completions.create({
            model: model.id,
            messages: openAiMessages,
            temperature: 0,
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
                };
            }
        }
    }
    getModel() {
        const modelId = this.options.apiModelId;
        if (modelId && modelId in nousResearchModels) {
            const id = modelId;
            return { id, info: nousResearchModels[id] };
        }
        return { id: nousResearchDefaultModelId, info: nousResearchModels[nousResearchDefaultModelId] };
    }
}
__decorate([
    withRetry()
], NousResearchHandler.prototype, "createMessage", null);
//# sourceMappingURL=nousresearch.js.map