var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Mistral } from "@mistralai/mistralai";
import { HTTPClient } from "@mistralai/mistralai/lib/http";
import { mistralDefaultModelId, mistralModels } from "@shared/api";
import { buildExternalBasicHeaders } from "@/services/EnvUtils";
import { fetch } from "@/shared/net";
import { withRetry } from "../retry";
import { convertToMistralMessages } from "../transform/mistral-format";
export class MistralHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.mistralApiKey) {
                throw new Error("Mistral API key is required");
            }
            try {
                const externalHeaders = buildExternalBasicHeaders();
                // Create HTTP client with custom fetch for proxy support
                // The Mistral SDK's HTTPClient passes a Request object to the fetcher,
                // but we need to extract the URL and init options to pass to our fetch wrapper
                // which properly handles proxy configuration in standalone mode (JetBrains/CLI)
                const httpClient = new HTTPClient({
                    fetcher: async (input, init) => {
                        // Handle both string/URL and Request object inputs
                        if (input instanceof Request) {
                            Object.keys(externalHeaders).forEach((key) => {
                                if (!input.headers.has(key)) {
                                    input.headers.set(key, externalHeaders[key]);
                                }
                            });
                            return fetch(input.url, {
                                method: input.method,
                                headers: input.headers,
                                body: input.body,
                                redirect: input.redirect,
                                signal: input.signal,
                                // duplex is required when sending a body stream in Node.js/undici
                                duplex: input.body ? "half" : undefined,
                                ...init,
                            });
                        }
                        // Merge external headers with existing headers
                        const mergedInit = {
                            ...init,
                            headers: {
                                ...externalHeaders,
                                ...(init?.headers || {}),
                            },
                        };
                        return fetch(input, mergedInit);
                    },
                });
                this.client = new Mistral({
                    apiKey: this.options.mistralApiKey,
                    httpClient,
                });
            }
            catch (error) {
                throw new Error(`Error creating Mistral client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const stream = await client.chat
            .stream({
            model: this.getModel().id,
            // max_completion_tokens: this.getModel().info.maxTokens,
            temperature: 0,
            messages: [{ role: "system", content: systemPrompt }, ...convertToMistralMessages(messages)],
            stream: true,
            tools: tools?.length ? tools : undefined,
            toolChoice: tools?.length ? "any" : undefined,
        })
            .catch((err) => {
            // The Mistal SDK uses statusCode instead of status
            // However, if they introduce status for something, I don't want to override it
            if ("statusCode" in err && !("status" in err)) {
                err.status = err.statusCode;
            }
            throw err;
        });
        for await (const chunk of stream) {
            const delta = chunk.data.choices[0]?.delta;
            if (delta.toolCalls) {
                for (const toolCall of delta.toolCalls) {
                    yield {
                        type: "tool_calls",
                        tool_call: {
                            function: {
                                id: toolCall.id,
                                name: toolCall.function.name,
                                arguments: JSON.stringify(toolCall.function.arguments),
                            },
                        },
                    };
                }
            }
            else if (delta?.content) {
                let content = "";
                if (typeof delta.content === "string") {
                    content = delta.content;
                }
                else if (Array.isArray(delta.content)) {
                    content = delta.content.map((c) => (c.type === "text" ? c.text : "")).join("");
                }
                yield {
                    type: "text",
                    text: content,
                };
            }
            if (chunk.data.usage) {
                yield {
                    type: "usage",
                    inputTokens: chunk.data.usage.promptTokens || 0,
                    outputTokens: chunk.data.usage.completionTokens || 0,
                };
            }
        }
    }
    getModel() {
        const modelId = this.options.apiModelId;
        if (modelId && modelId in mistralModels) {
            const id = modelId;
            return { id, info: mistralModels[id] };
        }
        return {
            id: mistralDefaultModelId,
            info: mistralModels[mistralDefaultModelId],
        };
    }
}
__decorate([
    withRetry()
], MistralHandler.prototype, "createMessage", null);
//# sourceMappingURL=mistral.js.map