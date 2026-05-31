var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import { StateManager } from "@core/storage/StateManager";
import { openRouterDefaultModelInfo } from "@shared/api";
import { shouldSkipReasoningForModel } from "@utils/model-utils";
import axios from "axios";
import { createOpenAIClient, getAxiosSettings } from "@/shared/net";
import { Logger } from "@/shared/services/Logger";
import { withRetry } from "../retry";
import { createOpenRouterStream } from "../transform/openrouter-stream";
import { ToolCallProcessor } from "../transform/tool-call-processor";
export class OpenRouterHandler {
    options;
    client;
    lastGenerationId;
    constructor(options) {
        this.options = options;
    }
    ensureClient() {
        if (!this.client) {
            if (!this.options.openRouterApiKey) {
                throw new Error("OpenRouter API key is required");
            }
            try {
                this.client = createOpenAIClient({
                    baseURL: "https://openrouter.ai/api/v1",
                    // Trim — trailing whitespace in keys/headers causes 401/502 with cryptic errors.
                    apiKey: this.options.openRouterApiKey.trim(),
                    defaultHeaders: {
                        "HTTP-Referer": "https://cline.bot", // Optional, for including your app on openrouter.ai rankings.
                        "X-Title": "Cline", // Optional. Shows in rankings on openrouter.ai.
                    },
                });
            }
            catch (error) {
                throw new Error(`Error creating OpenRouter client: ${error.message}`);
            }
        }
        return this.client;
    }
    async *createMessage(systemPrompt, messages, tools) {
        const client = this.ensureClient();
        this.lastGenerationId = undefined;
        const stream = await createOpenRouterStream(client, systemPrompt, messages, this.getModel(), this.options.reasoningEffort, this.options.thinkingBudgetTokens, this.options.openRouterProviderSorting, tools, this.options.enableParallelToolCalling);
        let didOutputUsage = false;
        const toolCallProcessor = new ToolCallProcessor();
        for await (const chunk of stream) {
            // openrouter returns an error object instead of the openai sdk throwing an error
            // Check for error field directly on chunk
            if ("error" in chunk) {
                const error = chunk.error;
                Logger.error(`OpenRouter API Error: ${error?.code} - ${error?.message}`);
                // Include metadata in the error message if available
                const metadataStr = error.metadata ? `\nMetadata: ${JSON.stringify(error.metadata, null, 2)}` : "";
                throw new Error(`OpenRouter API Error ${error.code}: ${error.message}${metadataStr}`);
            }
            // Check for error in choices[0].finish_reason
            // OpenRouter may return errors in a non-standard way within choices
            const choice = chunk.choices?.[0];
            // Use type assertion since OpenRouter uses non-standard "error" finish_reason
            if (choice?.finish_reason === "error") {
                // Use type assertion since OpenRouter adds non-standard error property
                const choiceWithError = choice;
                if (choiceWithError.error) {
                    const error = choiceWithError.error;
                    Logger.error(`OpenRouter Mid-Stream Error: ${error?.code || "Unknown"} - ${error?.message || "Unknown error"}`);
                    // Format error details
                    const errorDetails = typeof error === "object" ? JSON.stringify(error, null, 2) : String(error);
                    throw new Error(`OpenRouter Mid-Stream Error: ${errorDetails}`);
                }
                // Fallback if error details are not available
                throw new Error(`OpenRouter Mid-Stream Error: Stream terminated with error status but no error details provided`);
            }
            if (!this.lastGenerationId && chunk.id) {
                this.lastGenerationId = chunk.id;
            }
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
            // Reasoning tokens are returned separately from the content
            // Skip reasoning content for Grok 4 models since it only displays "thinking" without providing useful information
            if (delta &&
                "reasoning" in delta &&
                delta.reasoning &&
                !shouldSkipReasoningForModel(this.options.openRouterModelId)) {
                yield {
                    type: "reasoning",
                    reasoning: typeof delta.reasoning === "string" ? delta.reasoning : JSON.stringify(delta.reasoning),
                };
            }
            // OpenRouter passes reasoning details that we can pass back unmodified in api requests to preserve reasoning traces for model
            // See: https://openrouter.ai/docs/use-cases/reasoning-tokens#preserving-reasoning-blocks
            if (delta &&
                "reasoning_details" in delta &&
                delta.reasoning_details &&
                // @ts-expect-error-next-line
                delta.reasoning_details.length && // exists and non-0
                !shouldSkipReasoningForModel(this.options.openRouterModelId)) {
                yield {
                    type: "reasoning",
                    reasoning: "",
                    details: delta.reasoning_details,
                };
            }
            if (!didOutputUsage && chunk.usage) {
                yield {
                    type: "usage",
                    cacheWriteTokens: 0,
                    cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens || 0,
                    inputTokens: (chunk.usage.prompt_tokens || 0) - (chunk.usage.prompt_tokens_details?.cached_tokens || 0),
                    outputTokens: chunk.usage.completion_tokens || 0,
                    // @ts-expect-error-next-line
                    totalCost: (chunk.usage.cost || 0) + (chunk.usage.cost_details?.upstream_inference_cost || 0),
                };
                didOutputUsage = true;
            }
        }
        // Fallback to generation endpoint if usage chunk not returned
        if (!didOutputUsage) {
            const apiStreamUsage = await this.getApiStreamUsage();
            if (apiStreamUsage) {
                yield apiStreamUsage;
            }
        }
    }
    async getApiStreamUsage() {
        if (this.lastGenerationId) {
            await setTimeoutPromise(500); // FIXME: necessary delay to ensure generation endpoint is ready
            try {
                const generationIterator = this.fetchGenerationDetails(this.lastGenerationId);
                const generation = (await generationIterator.next()).value;
                // Logger.log("OpenRouter generation details:", generation)
                return {
                    type: "usage",
                    cacheWriteTokens: 0,
                    cacheReadTokens: generation?.native_tokens_cached || 0,
                    // openrouter generation endpoint fails often
                    inputTokens: (generation?.native_tokens_prompt || 0) - (generation?.native_tokens_cached || 0),
                    outputTokens: generation?.native_tokens_completion || 0,
                    totalCost: generation?.total_cost || 0,
                };
            }
            catch (error) {
                // ignore if fails
                Logger.error("Error fetching OpenRouter generation details:", error);
            }
        }
        return undefined;
    }
    async *fetchGenerationDetails(genId) {
        // Logger.log("Fetching generation details for:", genId)
        try {
            const response = await axios.get(`https://openrouter.ai/api/v1/generation?id=${genId}`, {
                headers: {
                    Authorization: `Bearer ${this.options.openRouterApiKey}`,
                },
                timeout: 15_000, // this request hangs sometimes
                ...getAxiosSettings(),
            });
            yield response.data?.data;
        }
        catch (error) {
            // ignore if fails
            Logger.error("Error fetching OpenRouter generation details:", error);
            throw error;
        }
    }
    getModel() {
        const rawModelId = this.options.openRouterModelId;
        const trimmed = rawModelId?.trim();
        // Honor whatever the user set in the dashboard — but validate format first.
        // OpenRouter requires `vendor/model[:variant]` (e.g. "anthropic/claude-sonnet-4.5",
        // "deepseek/deepseek-chat:free"). A bare value like "free" returns a cryptic
        // `Invalid URL:` 502 from OpenRouter's "Stealth" fallback. Throw clearly instead.
        if (!trimmed || trimmed.length === 0) {
            throw new Error(`OpenRouter model is not set. Open Dashboard → Settings → AI API Configuration and ` +
                `enter a model ID like "anthropic/claude-sonnet-4.5" or "deepseek/deepseek-chat:free".`);
        }
        if (!trimmed.includes("/")) {
            throw new Error(`OpenRouter model ID "${trimmed}" is not in the required "vendor/model" format. ` +
                `Open Dashboard → Settings and use a full ID like "deepseek/deepseek-chat:free" ` +
                `or "anthropic/claude-sonnet-4.5".`);
        }
        // Don't log on every call — getModel() is invoked dozens of times per turn during
        // system-prompt construction. Use debug so it shows when IS_DEV=true only.
        Logger.debug(`[OpenRouter] getModel: using="${trimmed}"`);
        const cachedModelInfo = StateManager.get().getModelInfo("openRouter", trimmed);
        return {
            id: trimmed,
            info: cachedModelInfo || openRouterDefaultModelInfo,
        };
    }
}
__decorate([
    withRetry()
], OpenRouterHandler.prototype, "createMessage", null);
__decorate([
    withRetry({ maxRetries: 4, baseDelay: 250, maxDelay: 1000, retryAllErrors: true })
], OpenRouterHandler.prototype, "fetchGenerationDetails", null);
//# sourceMappingURL=openrouter.js.map