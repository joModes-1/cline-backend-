var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { askSageDefaultModelId, askSageDefaultURL, askSageModels } from "@shared/api";
import { buildExternalBasicHeaders } from "@/services/EnvUtils";
import { fetch } from "@/shared/net";
import { Logger } from "@/shared/services/Logger";
import { withRetry } from "../retry";
export class AskSageHandler {
    options;
    apiUrl;
    apiKey;
    constructor(options) {
        Logger.log("init api url", options.asksageApiUrl, askSageDefaultURL);
        this.options = options;
        this.apiKey = options.asksageApiKey || "";
        this.apiUrl = options.asksageApiUrl || askSageDefaultURL;
        if (!this.apiKey) {
            throw new Error("AskSage API key is required");
        }
    }
    async *createMessage(systemPrompt, messages) {
        try {
            const model = this.getModel();
            // Transform messages into AskSageRequest format
            const formattedMessages = messages.map((msg) => {
                const content = Array.isArray(msg.content)
                    ? msg.content.map((block) => ("text" in block ? block.text : "")).join("")
                    : msg.content;
                return {
                    user: msg.role === "assistant" ? "gpt" : "me",
                    message: content,
                };
            });
            const request = {
                system_prompt: systemPrompt,
                message: formattedMessages,
                model: model.id,
                dataset: "none",
                usage: true,
            };
            // Make request to AskSage API
            const response = await fetch(`${this.apiUrl}/query`, {
                method: "POST",
                headers: this.headers(),
                body: JSON.stringify(request),
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`AskSage API error: ${error}`);
            }
            const result = (await response.json());
            if (!result.message) {
                throw new Error("No content in AskSage response");
            }
            // Yield tool responses if they exist
            if (result.tool_responses && result.tool_responses.length > 0) {
                for (const toolResponse of result.tool_responses) {
                    yield {
                        type: "text",
                        text: `[Tool Response: ${JSON.stringify(toolResponse)}]\n`,
                    };
                }
            }
            // Yield the main response text
            yield {
                type: "text",
                text: result.message,
            };
            // Yield usage information if available
            if (result.usage) {
                yield {
                    type: "usage",
                    inputTokens: result.usage.model_tokens.prompt_tokens,
                    outputTokens: result.usage.model_tokens.completion_tokens,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    totalCost: result.usage.asksage_tokens, // Cost = Consumed AskSage tokens
                };
            }
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`AskSage request failed: ${error.message}`);
            }
            throw error;
        }
    }
    async getApiStreamUsage() {
        if (!this.apiKey) {
            return undefined;
        }
        try {
            const response = await fetch(`${this.apiUrl}/count-monthly-tokens`, {
                method: "POST",
                headers: this.headers(),
                body: JSON.stringify({ app_name: "asksage" }),
            });
            if (!response.ok) {
                Logger.error("Failed to fetch AskSage usage", await response.text());
                return undefined;
            }
            const data = await response.json();
            const usedTokens = data.response;
            return {
                type: "usage",
                inputTokens: usedTokens,
                outputTokens: 0,
            };
        }
        catch (error) {
            Logger.error("Error fetching AskSage usage:", error);
            return undefined;
        }
    }
    getModel() {
        const modelId = this.options.apiModelId;
        if (modelId && modelId in askSageModels) {
            const id = modelId;
            return { id, info: askSageModels[id] };
        }
        return {
            id: askSageDefaultModelId,
            info: askSageModels[askSageDefaultModelId],
        };
    }
    headers() {
        return {
            "Content-Type": "application/json",
            "x-access-tokens": this.apiKey,
            ...buildExternalBasicHeaders(),
        };
    }
}
__decorate([
    withRetry()
], AskSageHandler.prototype, "createMessage", null);
//# sourceMappingURL=asksage.js.map