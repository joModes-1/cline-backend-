var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Anthropic } from "@anthropic-ai/sdk";
import { ANTHROPIC_FAST_MODE_SUFFIX, anthropicDefaultModelId, anthropicModels, CLAUDE_SONNET_1M_SUFFIX, } from "@shared/api";
import { buildExternalBasicHeaders } from "@/services/EnvUtils";
import { fetch } from "@/shared/net";
import { withRetry } from "../retry";
import { sanitizeAnthropicMessages } from "../transform/anthropic-format";
export const ANTHROPIC_FAST_MODE_BETA = "fast-mode-2026-02-01";
export class AnthropicHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.apiKey) {
                throw new Error("Anthropic API key is required");
            }
            try {
                this.client = new Anthropic({
                    apiKey: this.options.apiKey,
                    baseURL: this.options.anthropicBaseUrl || undefined,
                    defaultHeaders: buildExternalBasicHeaders(),
                    fetch, // Use configured fetch with proxy support
                });
            }
            catch (error) {
                throw new Error(`Error creating Anthropic client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const model = this.getModel();
        let stream;
        const useFastMode = model.id.endsWith(ANTHROPIC_FAST_MODE_SUFFIX);
        const baseModelId = useFastMode ? model.id.slice(0, -ANTHROPIC_FAST_MODE_SUFFIX.length) : model.id;
        const modelId = baseModelId.endsWith(CLAUDE_SONNET_1M_SUFFIX)
            ? baseModelId.slice(0, -CLAUDE_SONNET_1M_SUFFIX.length)
            : baseModelId;
        const enable1mContextWindow = baseModelId.endsWith(CLAUDE_SONNET_1M_SUFFIX);
        const fastModeBetas = enable1mContextWindow
            ? [ANTHROPIC_FAST_MODE_BETA, "context-1m-2025-08-07"]
            : [ANTHROPIC_FAST_MODE_BETA];
        const createFastModeMessage = (body) => {
            return client.beta.messages.create({
                ...body,
                betas: fastModeBetas,
                speed: "fast",
            });
        };
        const budget_tokens = this.options.thinkingBudgetTokens || 0;
        // Tools are available only when native tools are enabled.
        const nativeToolsOn = tools?.length && tools?.length > 0;
        const reasoningOn = (model.info.supportsReasoning ?? false) && budget_tokens !== 0;
        if (model.info.supportsPromptCache) {
            const anthropicMessages = sanitizeAnthropicMessages(messages, true);
            const requestBody = {
                model: modelId,
                thinking: reasoningOn ? { type: "enabled", budget_tokens: budget_tokens } : undefined,
                max_tokens: model.info.maxTokens || 8192,
                // "Thinking isn’t compatible with temperature, top_p, or top_k modifications as well as forced tool use."
                // (https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking#important-considerations-when-using-extended-thinking)
                temperature: reasoningOn ? undefined : 0,
                system: [
                    {
                        text: systemPrompt,
                        type: "text",
                        cache_control: { type: "ephemeral" },
                    },
                ], // setting cache breakpoint for system prompt so new tasks can reuse it
                messages: anthropicMessages,
                // tools, // cache breakpoints go from tools > system > messages, and since tools dont change, we can just set the breakpoint at the end of system (this avoids having to set a breakpoint at the end of tools which by itself does not meet min requirements for haiku caching)
                stream: true,
                tools: nativeToolsOn ? tools : undefined,
                // tool_choice options:
                // - none: disables tool use, even if tools are provided. Claude will not call any tools.
                // - auto: allows Claude to decide whether to call any provided tools or not. This is the default value when tools are provided.
                // - any: tells Claude that it must use one of the provided tools, but doesn’t force a particular tool.
                // NOTE: Forcing tool use when tools are provided will result in error when thinking is also enabled.
                tool_choice: nativeToolsOn && !reasoningOn ? { type: "any" } : undefined,
            };
            stream = useFastMode
                ? await createFastModeMessage(requestBody)
                : await client.messages.create(requestBody, (() => {
                    // 1m context window beta header
                    if (enable1mContextWindow) {
                        return {
                            headers: {
                                "anthropic-beta": "context-1m-2025-08-07",
                            },
                        };
                    }
                    return undefined;
                })());
        }
        else {
            const requestBody = {
                model: modelId,
                max_tokens: model.info.maxTokens || 8192,
                temperature: 0,
                system: [{ text: systemPrompt, type: "text" }],
                messages: sanitizeAnthropicMessages(messages, false),
                tools: nativeToolsOn ? tools : undefined,
                tool_choice: { type: "auto" },
                stream: true,
            };
            stream = useFastMode ? await createFastModeMessage(requestBody) : await client.messages.create(requestBody);
        }
        const lastStartedToolCall = { id: "", name: "", arguments: "" };
        for await (const chunk of stream) {
            switch (chunk?.type) {
                case "message_start":
                    {
                        // tells us cache reads/writes/input/output
                        const usage = chunk.message.usage;
                        yield {
                            type: "usage",
                            inputTokens: usage.input_tokens || 0,
                            outputTokens: usage.output_tokens || 0,
                            cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
                            cacheReadTokens: usage.cache_read_input_tokens || undefined,
                        };
                    }
                    break;
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
                            // Content is encrypted, and we don't to pass placeholder text back to the API
                            yield {
                                type: "reasoning",
                                reasoning: "[Redacted thinking block]",
                                redacted_data: chunk.content_block.data,
                            };
                            break;
                        case "tool_use":
                            if (chunk.content_block.id && chunk.content_block.name) {
                                // Convert Anthropic tool_use to OpenAI-compatible format
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
                            // 'reasoning' type just displays in the UI, but ant_thinking will be used to send the thinking traces back to the API
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
                                    reasoning: "", // reasoning text is already sent via thinking_delta
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
                                // 	// Convert Anthropic tool_use to OpenAI-compatible format
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
        if (modelId && modelId in anthropicModels) {
            const id = modelId;
            return { id, info: anthropicModels[id] };
        }
        return {
            id: anthropicDefaultModelId,
            info: anthropicModels[anthropicDefaultModelId],
        };
    }
}
__decorate([
    withRetry()
], AnthropicHandler.prototype, "createMessage", null);
//# sourceMappingURL=anthropic.js.map