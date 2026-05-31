var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { openAiModelInfoSaneDefaults } from "@shared/api";
import { Ollama } from "ollama";
import { buildExternalBasicHeaders } from "@/services/EnvUtils";
import { fetch } from "@/shared/net";
import { Logger } from "@/shared/services/Logger";
import { withRetry } from "../retry";
import { convertToOllamaMessages } from "../transform/ollama-format";
import { ToolCallProcessor } from "../transform/tool-call-processor";
const DEFAULT_CONTEXT_WINDOW = 32768;
export class OllamaHandler {
    options;
    client;
    constructor(options) {
        const ollamaApiOptionsCtxNum = (options.ollamaApiOptionsCtxNum ?? DEFAULT_CONTEXT_WINDOW).toString();
        this.options = { ...options, ollamaApiOptionsCtxNum };
    }
    ensureClient() {
        if (!this.client) {
            try {
                const externalHeaders = buildExternalBasicHeaders();
                const clientOptions = {
                    host: this.options.ollamaBaseUrl,
                    fetch,
                    headers: externalHeaders,
                };
                // Add API key if provided (for Ollama cloud or authenticated instances)
                if (this.options.ollamaApiKey) {
                    clientOptions.headers = {
                        ...clientOptions.headers,
                        Authorization: `Bearer ${this.options.ollamaApiKey}`,
                    };
                }
                this.client = new Ollama(clientOptions);
            }
            catch (error) {
                throw new Error(`Error creating Ollama client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        const ollamaMessages = [{ role: "system", content: systemPrompt }, ...convertToOllamaMessages(messages)];
        try {
            // Create a promise that rejects after timeout
            const timeoutMs = this.options.requestTimeoutMs || 30000;
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Ollama request timed out after ${timeoutMs / 1000} seconds`)), timeoutMs);
            });
            // Create the actual API request promise
            const apiPromise = client.chat({
                model: this.getModel().id,
                messages: ollamaMessages,
                stream: true,
                options: {
                    num_ctx: Number(this.options.ollamaApiOptionsCtxNum),
                },
                tools: tools,
            });
            const toolCallProcessor = new ToolCallProcessor();
            // Race the API request against the timeout
            const stream = (await Promise.race([apiPromise, timeoutPromise]));
            try {
                for await (const chunk of stream) {
                    Logger.debug("[OllamaHandler] Message Chunk" + JSON.stringify(chunk));
                    const delta = chunk.message;
                    if (delta?.tool_calls) {
                        Logger.debug(`[OllamaHandler] Tool Calls Detected: ${JSON.stringify(delta.tool_calls)}`);
                        yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls?.map((tc, inx) => ({
                            index: inx,
                            id: `ollama-tool-${inx}`,
                            function: {
                                name: tc.function.name,
                                arguments: typeof tc.function.arguments === "string"
                                    ? tc.function.arguments
                                    : JSON.stringify(tc.function.arguments),
                            },
                            type: "function",
                        })));
                    }
                    if (typeof delta.content === "string") {
                        yield {
                            type: "text",
                            text: delta.content,
                        };
                    }
                    // Handle token usage if available
                    if (chunk.eval_count !== undefined || chunk.prompt_eval_count !== undefined) {
                        yield {
                            type: "usage",
                            inputTokens: chunk.prompt_eval_count || 0,
                            outputTokens: chunk.eval_count || 0,
                        };
                    }
                }
            }
            catch (streamError) {
                Logger.error("Error processing Ollama stream:", streamError);
                throw new Error(`Ollama stream processing error: ${streamError.message || "Unknown error"}`);
            }
        }
        catch (error) {
            // Check if it's a timeout error
            if (error?.message?.includes("timed out")) {
                const timeoutMs = this.options.requestTimeoutMs || 30000;
                throw new Error(`Ollama request timed out after ${timeoutMs / 1000} seconds`);
            }
            // Enhance error reporting
            const statusCode = error.status || error.statusCode;
            const errorMessage = error.message || "Unknown error";
            Logger.error(`Ollama API error (${statusCode || "unknown"}): ${errorMessage}`);
            throw error;
        }
    }
    getModel() {
        return {
            id: this.options.ollamaModelId || "",
            info: {
                ...openAiModelInfoSaneDefaults,
                contextWindow: Number(this.options.ollamaApiOptionsCtxNum),
            },
        };
    }
    abort() {
        this.client?.abort();
    }
}
__decorate([
    withRetry({ retryAllErrors: true })
], OllamaHandler.prototype, "createMessage", null);
//# sourceMappingURL=ollama.js.map