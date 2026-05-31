var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Anthropic } from "@anthropic-ai/sdk";
import { buildExternalBasicHeaders } from "@/services/EnvUtils";
import { minimaxDefaultModelId, minimaxModels } from "@/shared/api";
import { fetch } from "@/shared/net";
import { withRetry } from "../retry";
export class MinimaxHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.minimaxApiKey) {
                throw new Error("MiniMax API key is required");
            }
            try {
                const externalHeaders = buildExternalBasicHeaders();
                this.client = new Anthropic({
                    apiKey: this.options.minimaxApiKey,
                    baseURL: this.options.minimaxApiLine === "china"
                        ? "https://api.minimaxi.com/anthropic"
                        : "https://api.minimax.io/anthropic",
                    defaultHeaders: externalHeaders,
                    fetch, // Use configured fetch with proxy support
                });
            }
            catch (error) {
                throw new Error(`Error creating MiniMax client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const model = this.getModel();
        // Tools are available only when native tools are enabled
        const nativeToolsOn = tools?.length && tools?.length > 0;
        const budget_tokens = this.options.thinkingBudgetTokens || 0;
        const reasoningOn = (model.info.supportsReasoning ?? false) && budget_tokens !== 0;
        // MiniMax M2 uses Anthropic API format
        const stream = await client.messages.create({
            model: model.id,
            max_tokens: model.info.maxTokens || 8192,
            system: [{ text: systemPrompt, type: "text" }],
            messages,
            stream: true,
            tools: nativeToolsOn ? tools : undefined,
            thinking: reasoningOn ? { type: "enabled", budget_tokens: budget_tokens } : undefined,
            // "Thinking isn't compatible with temperature, top_p, or top_k modifications"
            temperature: reasoningOn ? undefined : 1.0, // MiniMax recommends 1.0, range is (0.0, 1.0]
            // NOTE: Forcing tool use when tools are provided will result in error when thinking is also enabled.
            tool_choice: nativeToolsOn && !reasoningOn ? { type: "any" } : undefined,
        });
        const lastStartedToolCall = { id: "", name: "", arguments: "" };
        for await (const chunk of stream) {
            switch (chunk?.type) {
                case "message_start": {
                    // tells us cache reads/writes/input/output
                    const usage = chunk.message.usage;
                    yield {
                        type: "usage",
                        inputTokens: usage.input_tokens || 0,
                        outputTokens: usage.output_tokens || 0,
                        cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
                        cacheReadTokens: usage.cache_read_input_tokens || undefined,
                    };
                    break;
                }
                case "message_delta":
                    // tells us stop_reason, stop_sequence, and output tokens along the way and at the end of the message
                    yield {
                        type: "usage",
                        inputTokens: 0,
                        outputTokens: chunk.usage.output_tokens || 0,
                    };
                    break;
                case "message_stop":
                    // no usage data, just an indicator that the message is done
                    break;
                case "content_block_start":
                    switch (chunk.content_block.type) {
                        case "thinking":
                            yield {
                                type: "reasoning",
                                reasoning: chunk.content_block.thinking || "",
                                signature: chunk.content_block.signature,
                            };
                            break;
                        case "redacted_thinking":
                            // Content is encrypted, and we don't want to pass placeholder text back to the API
                            yield {
                                type: "reasoning",
                                reasoning: "[Redacted thinking block]",
                                redacted_data: chunk.content_block.data,
                            };
                            break;
                        case "tool_use":
                            if (chunk.content_block.id && chunk.content_block.name) {
                                // Store tool call information for streaming
                                lastStartedToolCall.id = chunk.content_block.id;
                                lastStartedToolCall.name = chunk.content_block.name;
                                lastStartedToolCall.arguments = "";
                            }
                            break;
                        case "text":
                            // we may receive multiple text blocks, in which case just insert a line break between them
                            if (chunk.index > 0) {
                                yield {
                                    type: "text",
                                    text: "\n",
                                };
                            }
                            yield {
                                type: "text",
                                text: chunk.content_block.text,
                            };
                            break;
                    }
                    break;
                case "content_block_delta":
                    switch (chunk.delta.type) {
                        case "thinking_delta":
                            // 'reasoning' type just displays in the UI, but reasoning with signature will be used to send the thinking traces back to the API
                            yield {
                                type: "reasoning",
                                reasoning: chunk.delta.thinking,
                            };
                            break;
                        case "signature_delta":
                            // It's used when sending the thinking block back to the API
                            // API expects this in completed form, not as array of deltas
                            if (chunk.delta.signature) {
                                yield {
                                    type: "reasoning",
                                    reasoning: "",
                                    signature: chunk.delta.signature,
                                };
                            }
                            break;
                        case "text_delta":
                            yield {
                                type: "text",
                                text: chunk.delta.text,
                            };
                            break;
                        case "input_json_delta":
                            if (lastStartedToolCall.id && lastStartedToolCall.name && chunk.delta.partial_json) {
                                // Convert Anthropic tool_use to OpenAI-compatible format for internal processing
                                yield {
                                    type: "tool_calls",
                                    tool_call: {
                                        ...lastStartedToolCall,
                                        function: {
                                            ...lastStartedToolCall,
                                            id: lastStartedToolCall.id,
                                            name: lastStartedToolCall.name,
                                            arguments: chunk.delta.partial_json,
                                        },
                                    },
                                };
                            }
                            break;
                    }
                    break;
                case "content_block_stop":
                    lastStartedToolCall.id = "";
                    lastStartedToolCall.name = "";
                    lastStartedToolCall.arguments = "";
                    break;
            }
        }
    }
    getModel() {
        const modelId = this.options.apiModelId;
        if (modelId && modelId in minimaxModels) {
            const id = modelId;
            return { id, info: minimaxModels[id] };
        }
        return { id: minimaxDefaultModelId, info: minimaxModels[minimaxDefaultModelId] };
    }
}
__decorate([
    withRetry()
], MinimaxHandler.prototype, "createMessage", null);
//# sourceMappingURL=minimax.js.map