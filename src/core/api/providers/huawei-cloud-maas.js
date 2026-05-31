var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { huaweiCloudMaasDefaultModelId, huaweiCloudMaasModels } from "@shared/api";
import { createOpenAIClient } from "@/shared/net";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { getOpenAIToolParams, ToolCallProcessor } from "../transform/tool-call-processor";
export class HuaweiCloudMaaSHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.huaweiCloudMaasApiKey) {
                throw new Error("Huawei Cloud MaaS API key is required");
            }
            try {
                this.client = createOpenAIClient({
                    baseURL: "https://api.modelarts-maas.com/v1/",
                    apiKey: this.options.huaweiCloudMaasApiKey,
                });
            }
            catch (error) {
                throw new Error(`Error creating Huawei Cloud MaaS client: ${error.message}`);
            }
        }
        return this.client;
    }
    getModel() {
        // First priority: huaweiCloudMaasModelId and huaweiCloudMaasModelInfo (like Groq does)
        const huaweiCloudMaasModelId = this.options.huaweiCloudMaasModelId;
        const huaweiCloudMaasModelInfo = this.options.huaweiCloudMaasModelInfo;
        if (huaweiCloudMaasModelId && huaweiCloudMaasModelInfo) {
            return { id: huaweiCloudMaasModelId, info: huaweiCloudMaasModelInfo };
        }
        // Second priority: huaweiCloudMaasModelId with static model info
        if (huaweiCloudMaasModelId && huaweiCloudMaasModelId in huaweiCloudMaasModels) {
            const id = huaweiCloudMaasModelId;
            return { id, info: huaweiCloudMaasModels[id] };
        }
        // Default fallback
        return {
            id: huaweiCloudMaasDefaultModelId,
            info: huaweiCloudMaasModels[huaweiCloudMaasDefaultModelId],
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
            temperature: 0,
            ...getOpenAIToolParams(tools),
        });
        let reasoning = null;
        let didOutputUsage = false;
        let finalUsage = null;
        const toolCallProcessor = new ToolCallProcessor();
        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta;
            // Handle reasoning content detection
            if (delta?.content) {
                if (reasoning || delta.content.includes("<think>")) {
                    reasoning = (reasoning || "") + delta.content;
                }
                else if (!reasoning) {
                    yield {
                        type: "text",
                        text: delta.content,
                    };
                }
            }
            if (delta?.tool_calls) {
                yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls);
            }
            // Handle reasoning output
            if (reasoning || (delta && "reasoning_content" in delta && delta.reasoning_content)) {
                const reasoningContent = delta?.content || delta?.reasoning_content || "";
                if (reasoningContent.trim()) {
                    yield {
                        type: "reasoning",
                        reasoning: reasoningContent,
                    };
                }
                // Check if reasoning is complete
                if (reasoning?.includes("</think>")) {
                    reasoning = null;
                }
            }
            // Store usage information for later output
            if (chunk.usage) {
                finalUsage = chunk.usage;
            }
            // Output usage when stream is finished
            if (!didOutputUsage && chunk.choices?.[0]?.finish_reason) {
                if (finalUsage) {
                    yield {
                        type: "usage",
                        inputTokens: finalUsage.prompt_tokens || 0,
                        outputTokens: finalUsage.completion_tokens || 0,
                        cacheWriteTokens: 0,
                        cacheReadTokens: 0,
                    };
                }
                didOutputUsage = true;
            }
        }
    }
}
__decorate([
    withRetry()
], HuaweiCloudMaaSHandler.prototype, "createMessage", null);
//# sourceMappingURL=huawei-cloud-maas.js.map