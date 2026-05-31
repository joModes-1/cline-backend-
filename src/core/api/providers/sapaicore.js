var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { ConversationRole as BedrockConversationRole, } from "@aws-sdk/client-bedrock-runtime";
import { OrchestrationClient } from "@sap-ai-sdk/orchestration";
import { transformServiceBindingToDestination } from "@sap-cloud-sdk/connectivity";
import { sapAiCoreDefaultModelId, sapAiCoreModels } from "@shared/api";
import axios from "axios";
import JSON5 from "json5";
import { buildExternalBasicHeaders } from "@/services/EnvUtils";
import { getAxiosSettings } from "@/shared/net";
import { Logger } from "@/shared/services/Logger";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
// Bedrock namespace containing caching-related functions
var Bedrock;
(function (Bedrock) {
    /**
     * Prepares system messages with optional caching support
     */
    function prepareSystemMessages(systemPrompt, enableCaching) {
        if (!systemPrompt) {
            return undefined;
        }
        if (enableCaching) {
            return [{ text: systemPrompt }, { cachePoint: { type: "default" } }];
        }
        return [{ text: systemPrompt }];
    }
    Bedrock.prepareSystemMessages = prepareSystemMessages;
    /**
     * Applies cache control to messages for prompt caching using AWS Bedrock's cachePoint system
     * AWS Bedrock uses cachePoint objects instead of Anthropic's cache_control approach
     */
    function applyCacheControlToMessages(messages, lastUserMsgIndex, secondLastMsgUserIndex) {
        return messages.map((message, index) => {
            // Add cachePoint to the last user message and second-to-last user message
            if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
                // Clone the message to avoid modifying the original
                const messageWithCache = { ...message };
                if (messageWithCache.content && Array.isArray(messageWithCache.content)) {
                    // Add cachePoint to the end of the content array
                    messageWithCache.content = [
                        ...messageWithCache.content,
                        {
                            cachePoint: {
                                type: "default",
                            },
                        },
                    ];
                }
                return messageWithCache;
            }
            return message;
        });
    }
    Bedrock.applyCacheControlToMessages = applyCacheControlToMessages;
    /**
     * Formats messages for models using the Converse API specification
     * Used by both Anthropic and Nova models to avoid code duplication
     */
    function formatMessagesForConverseAPI(messages) {
        return messages.map((message) => {
            // Determine role (user or assistant)
            const role = message.role === "user" ? BedrockConversationRole.USER : BedrockConversationRole.ASSISTANT;
            // Process content based on type
            let content = [];
            if (typeof message.content === "string") {
                // Simple text content
                content = [{ text: message.content }];
            }
            else if (Array.isArray(message.content)) {
                // Convert Anthropic content format to Converse API content format
                const processedContent = message.content
                    .map((item) => {
                    // Text content
                    if (item.type === "text") {
                        return { text: item.text };
                    }
                    // Image content
                    if (item.type === "image") {
                        return processImageContent(item);
                    }
                    // Log unsupported content types for debugging
                    Logger.warn(`Unsupported content type: ${item.type}`);
                    return null;
                })
                    .filter((item) => item !== null);
                content = processedContent;
            }
            // Return formatted message
            return {
                role,
                content,
            };
        });
    }
    Bedrock.formatMessagesForConverseAPI = formatMessagesForConverseAPI;
    /**
     * Processes image content with proper error handling and user notification
     */
    function processImageContent(item) {
        let format = "jpeg"; // default format
        // Extract format from media_type if available
        if (item.source.media_type) {
            // Extract format from media_type (e.g., "image/jpeg" -> "jpeg")
            const formatMatch = item.source.media_type.match(/image\/(\w+)/);
            if (formatMatch && formatMatch[1]) {
                const extractedFormat = formatMatch[1];
                // Ensure format is one of the allowed values
                if (["png", "jpeg", "gif", "webp"].includes(extractedFormat)) {
                    format = extractedFormat;
                }
            }
        }
        // Get image data with improved error handling
        try {
            let imageData;
            if (typeof item.source.data === "string") {
                // Keep as base64 string, just clean the data URI prefix if present
                imageData = item.source.data.replace(/^data:image\/\w+;base64,/, "");
            }
            else if (item.source.data && typeof item.source.data === "object") {
                // Convert Buffer/Uint8Array to base64 string
                if (Buffer.isBuffer(item.source.data)) {
                    imageData = item.source.data.toString("base64");
                }
                else {
                    // Assume Uint8Array
                    const buffer = Buffer.from(item.source.data);
                    imageData = buffer.toString("base64");
                }
            }
            else {
                throw new Error("Unsupported image data format");
            }
            // Validate base64 data
            if (!imageData || imageData.length === 0) {
                throw new Error("Empty or invalid image data");
            }
            return {
                image: {
                    format,
                    source: {
                        bytes: imageData, // Keep as base64 string for Bedrock Converse API compatibility
                    },
                },
            };
        }
        catch (error) {
            Logger.error("Failed to process image content:", error);
            // Return a text content indicating the error instead of null
            // This ensures users are aware of the issue
            return {
                text: `[ERROR: Failed to process image - ${error instanceof Error ? error.message : "Unknown error"}]`,
            };
        }
    }
})(Bedrock || (Bedrock = {}));
// Gemini namespace containing caching-related functions and types
var Gemini;
(function (Gemini) {
    /**
     * Process Gemini streaming response with enhanced thinking content support and caching awareness
     */
    function processStreamChunk(data) {
        const result = {};
        // Handle thinking content from Gemini's response
        const candidateForThoughts = data?.candidates?.[0];
        const partsForThoughts = candidateForThoughts?.content?.parts;
        let thoughts = "";
        if (partsForThoughts) {
            for (const part of partsForThoughts) {
                const { thought, text } = part;
                if (thought && text) {
                    thoughts += text + "\n";
                }
            }
        }
        if (thoughts.trim() !== "") {
            result.reasoning = thoughts.trim();
        }
        // Handle regular text content
        if (data.text) {
            result.text = data.text;
        }
        // Handle content parts for non-thought text
        if (data.candidates && data.candidates[0]?.content?.parts) {
            let nonThoughtText = "";
            for (const part of data.candidates[0].content.parts) {
                if (part.text && !part.thought) {
                    nonThoughtText += part.text;
                }
            }
            if (nonThoughtText && !result.text) {
                result.text = nonThoughtText;
            }
        }
        // Handle usage metadata with caching support
        if (data.usageMetadata) {
            result.usageMetadata = {
                promptTokenCount: data.usageMetadata.promptTokenCount,
                candidatesTokenCount: data.usageMetadata.candidatesTokenCount,
                thoughtsTokenCount: data.usageMetadata.thoughtsTokenCount,
                cachedContentTokenCount: data.usageMetadata.cachedContentTokenCount,
            };
        }
        return result;
    }
    Gemini.processStreamChunk = processStreamChunk;
    function convertAnthropicMessageToGemini(message) {
        const role = message.role === "assistant" ? "model" : "user";
        const parts = [];
        if (typeof message.content === "string") {
            parts.push({ text: message.content });
        }
        else if (Array.isArray(message.content)) {
            for (const block of message.content) {
                if (block.type === "text") {
                    parts.push({ text: block.text });
                }
                else if (block.type === "image") {
                    parts.push({
                        inlineData: {
                            mimeType: block.source.media_type,
                            data: block.source.data,
                        },
                    });
                }
            }
        }
        return { role, parts };
    }
    /**
     * Prepare Gemini request payload with implicit caching support
     */
    function prepareRequestPayload(systemPrompt, messages, model) {
        const contents = messages.map(convertAnthropicMessageToGemini);
        const payload = {
            contents,
            systemInstruction: {
                parts: [
                    {
                        text: systemPrompt,
                    },
                ],
            },
            generationConfig: {
                maxOutputTokens: model.info.maxTokens,
                temperature: 0.0,
            },
        };
        // Note: SAP AI Core's Gemini deployment doesn't support thinkingConfig yet
        // Commenting out until support is added
        // const thinkingBudget = thinkingBudgetTokens ?? 0
        // if (thinkingBudget > 0 && model.info.thinkingConfig) {
        // 	;(payload as any).thinkingConfig = {
        // 		thinkingBudget: thinkingBudget,
        // 		includeThoughts: true,
        // 	}
        // }
        return payload;
    }
    Gemini.prepareRequestPayload = prepareRequestPayload;
})(Gemini || (Gemini = {}));
export class SapAiCoreHandler {
    options;
    token;
    deployments;
    aiCoreDestination;
    destinationExpiresAt;
    constructor(options) {
        this.options = options;
    }
    /**
     * Converts a chunk from the stream to a UTF-8 string
     * Handles Buffer, string, and byte array formats
     */
    chunkToString(chunk) {
        if (Buffer.isBuffer(chunk)) {
            return chunk.toString("utf-8");
        }
        if (typeof chunk === "string") {
            return chunk;
        }
        // Handle comma-separated byte values or other array-like formats
        return Buffer.from(chunk).toString("utf-8");
    }
    validateCredentials() {
        if (!this.options.sapAiCoreClientId ||
            !this.options.sapAiCoreClientSecret ||
            !this.options.sapAiCoreTokenUrl ||
            !this.options.sapAiCoreBaseUrl) {
            throw new Error("Missing required SAP AI Core credentials. Please check your configuration.");
        }
    }
    async createAiCoreDestination() {
        try {
            const aiCoreServiceCredentials = {
                clientid: this.options.sapAiCoreClientId,
                clientsecret: this.options.sapAiCoreClientSecret,
                url: this.options.sapAiCoreTokenUrl,
                serviceurls: {
                    AI_API_URL: this.options.sapAiCoreBaseUrl,
                },
            };
            const destination = await transformServiceBindingToDestination({
                credentials: aiCoreServiceCredentials,
                name: "aicore",
                label: "aicore",
                tags: ["aicore"],
            });
            return {
                ...destination,
                url: destination.url || this.options.sapAiCoreBaseUrl,
            };
        }
        catch (error) {
            Logger.error("Failed to create AI Core destination:", error);
            throw new Error(`Unable to create AI Core destination: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async authenticate() {
        this.validateCredentials();
        const payload = {
            grant_type: "client_credentials",
            client_id: this.options.sapAiCoreClientId,
            client_secret: this.options.sapAiCoreClientSecret,
        };
        const externalHeaders = buildExternalBasicHeaders();
        const tokenUrl = this.options.sapAiCoreTokenUrl.replace(/\/+$/, "") + "/oauth/token";
        const response = await axios.post(tokenUrl, payload, {
            headers: { ...externalHeaders, "Content-Type": "application/x-www-form-urlencoded" },
            ...getAxiosSettings(),
        });
        const token = response.data;
        token.expires_at = Date.now() + token.expires_in * 1000;
        return token;
    }
    async getToken() {
        if (!this.token || this.token.expires_at < Date.now()) {
            this.token = await this.authenticate();
        }
        return this.token.access_token;
    }
    // TODO: these fallback fetching deployment id methods can be removed in future version if decided that users migration to fetching deployment id in design-time (open SAP AI Core provider UI) considered as completed.
    async getAiCoreDeployments() {
        const token = await this.getToken();
        const externalHeaders = buildExternalBasicHeaders();
        const headers = {
            ...externalHeaders,
            Authorization: `Bearer ${token}`,
            "AI-Resource-Group": this.options.sapAiResourceGroup || "default",
            "Content-Type": "application/json",
            "AI-Client-Type": "Cline",
        };
        const url = `${this.options.sapAiCoreBaseUrl}/v2/lm/deployments?$top=10000&$skip=0`;
        try {
            const response = await axios.get(url, { headers, ...getAxiosSettings() });
            const deployments = response.data.resources;
            return deployments
                .filter((deployment) => deployment.targetStatus === "RUNNING")
                .map((deployment) => {
                const model = deployment.details?.resources?.backend_details?.model;
                if (!model?.name || !model?.version) {
                    return null; // Skip this row
                }
                return {
                    id: deployment.id,
                    name: `${model.name}:${model.version}`,
                };
            })
                .filter((deployment) => deployment !== null);
        }
        catch (error) {
            Logger.error("Error fetching deployments:", error);
            throw new Error("Failed to fetch deployments");
        }
    }
    async getDeploymentForModel(modelId) {
        // If deployments are not fetched yet or the model is not found in the fetched deployments, fetch deployments
        if (!this.deployments || !this.hasDeploymentForModel(modelId)) {
            this.deployments = await this.getAiCoreDeployments();
        }
        const deployment = this.deployments.find((d) => {
            const deploymentBaseName = d.name.split(":")[0].toLowerCase();
            const modelBaseName = modelId.split(":")[0].toLowerCase();
            return deploymentBaseName === modelBaseName;
        });
        if (!deployment) {
            throw new Error(`No running deployment found for model ${modelId}`);
        }
        return deployment.id;
    }
    hasDeploymentForModel(modelId) {
        return this.deployments?.some((d) => d.name.split(":")[0].toLowerCase() === modelId.split(":")[0].toLowerCase()) ?? false;
    }
    async *createMessage(systemPrompt, messages) {
        if (this.options.sapAiCoreUseOrchestrationMode) {
            yield* this.createMessageWithOrchestration(systemPrompt, messages);
        }
        else {
            yield* this.createMessageWithDeployments(systemPrompt, messages);
        }
    }
    // TODO: support credentials changes after initial setup
    async ensureAiCoreEnvSetup() {
        if (!this.aiCoreDestination || !this.destinationExpiresAt || this.destinationExpiresAt < Date.now()) {
            this.validateCredentials();
            this.aiCoreDestination = await this.createAiCoreDestination();
            // Extract expiration from the destination's auth token
            const expiresIn = this.aiCoreDestination.authTokens?.[0]?.expiresIn;
            if (!expiresIn) {
                throw new Error("Destination is missing required authTokens with expiresIn");
            }
            this.destinationExpiresAt = Date.now() + Number.parseInt(expiresIn, 10) * 1000;
        }
    }
    async *createMessageWithOrchestration(systemPrompt, messages) {
        try {
            await this.ensureAiCoreEnvSetup();
            const model = this.getModel();
            const orchestrationConfig = {
                promptTemplating: {
                    model: {
                        name: model.id,
                    },
                    prompt: {
                        template: [
                            {
                                role: "system",
                                content: systemPrompt,
                            },
                        ],
                    },
                },
            };
            const orchestrationClient = new OrchestrationClient(orchestrationConfig, {
                resourceGroup: this.options.sapAiResourceGroup || "default",
            }, this.aiCoreDestination);
            const sapMessages = this.convertMessageParamToSAPMessages(messages);
            // messagesHistory: Contains the conversation context (user/assistant messages).
            // Unlike the `messages` field that validates input, this does not validate
            // template placeholders such as {{?userResponse}}, allowing content to be
            // sent directly to the LLM with the Cline system prompt without validation errors.
            const response = await orchestrationClient.stream({
                messagesHistory: sapMessages,
            });
            for await (const chunk of response.stream.toContentStream()) {
                yield { type: "text", text: chunk };
            }
            const tokenUsage = response.getTokenUsage();
            if (tokenUsage) {
                yield {
                    type: "usage",
                    inputTokens: tokenUsage.prompt_tokens || 0,
                    outputTokens: tokenUsage.completion_tokens || 0,
                };
            }
        }
        catch (error) {
            Logger.error("Error in SAP orchestration mode:", error);
            throw error;
        }
    }
    async *createMessageWithDeployments(systemPrompt, messages) {
        const token = await this.getToken();
        const externalHeaders = buildExternalBasicHeaders();
        const headers = {
            ...externalHeaders,
            Authorization: `Bearer ${token}`,
            "AI-Resource-Group": this.options.sapAiResourceGroup || "default",
            "Content-Type": "application/json",
            "AI-Client-Type": "Cline",
        };
        const model = this.getModel();
        let deploymentId = this.options.deploymentId;
        if (!deploymentId) {
            // Fallback to runtime deployment id fetching for users who haven't opened the SAP provider UI
            Logger.log(`No pre-configured deployment ID found for model ${model.id}, falling back to runtime fetching`);
            deploymentId = await this.getDeploymentForModel(model.id);
        }
        const anthropicModels = [
            "anthropic--claude-4.5-haiku",
            "anthropic--claude-4.5-opus",
            "anthropic--claude-4.6-sonnet",
            "anthropic--claude-4.5-sonnet",
            "anthropic--claude-4-sonnet",
            "anthropic--claude-4-opus",
            "anthropic--claude-3.7-sonnet",
            "anthropic--claude-3.5-sonnet",
            "anthropic--claude-3-sonnet",
            "anthropic--claude-3-haiku",
            "anthropic--claude-3-opus",
        ];
        const openAIModels = [
            "gpt-4o",
            "gpt-4",
            "gpt-4o-mini",
            "o1",
            "gpt-4.1",
            "gpt-4.1-nano",
            "gpt-5",
            "gpt-5-nano",
            "gpt-5-mini",
            "o3-mini",
            "o3",
            "o4-mini",
        ];
        const perplexityModels = ["sonar-pro", "sonar"];
        const geminiModels = ["gemini-2.5-flash", "gemini-2.5-pro"];
        let url;
        let payload;
        if (anthropicModels.includes(model.id)) {
            url = `${this.options.sapAiCoreBaseUrl}/v2/inference/deployments/${deploymentId}/invoke-with-response-stream`;
            // Format messages for Converse API. Note that the Invoke API has
            // the same format for messages as the Converse API.
            const formattedMessages = Bedrock.formatMessagesForConverseAPI(messages);
            // Get message indices for caching
            const userMsgIndices = messages.reduce((acc, msg, index) => {
                if (msg.role === "user") {
                    acc.push(index);
                }
                return acc;
            }, []);
            const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1;
            const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1;
            if (model.id === "anthropic--claude-4.5-opus" ||
                model.id === "anthropic--claude-4.6-sonnet" ||
                model.id === "anthropic--claude-4.5-sonnet" ||
                model.id === "anthropic--claude-4.5-haiku" ||
                model.id === "anthropic--claude-4-sonnet" ||
                model.id === "anthropic--claude-4-opus" ||
                model.id === "anthropic--claude-3.7-sonnet") {
                // Use converse-stream endpoint with caching support
                url = `${this.options.sapAiCoreBaseUrl}/v2/inference/deployments/${deploymentId}/converse-stream`;
                // Apply caching controls to messages (enabled by default)
                const messagesWithCache = Bedrock.applyCacheControlToMessages(formattedMessages, lastUserMsgIndex, secondLastMsgUserIndex);
                // Prepare system message with caching support (enabled by default)
                const systemMessages = Bedrock.prepareSystemMessages(systemPrompt, true);
                payload = {
                    inferenceConfig: {
                        maxTokens: model.info.maxTokens,
                        temperature: 0.0,
                    },
                    system: systemMessages,
                    messages: messagesWithCache,
                };
            }
            else {
                // Use invoke-with-response-stream endpoint
                // TODO: add caching support using Anthropic-native cache_control blocks
                payload = {
                    max_tokens: model.info.maxTokens,
                    system: systemPrompt,
                    messages,
                    anthropic_version: "bedrock-2023-05-31",
                };
            }
        }
        else if (openAIModels.includes(model.id)) {
            const openAiMessages = [
                { role: "system", content: systemPrompt },
                ...convertToOpenAiMessages(messages),
            ];
            url = `${this.options.sapAiCoreBaseUrl}/v2/inference/deployments/${deploymentId}/chat/completions?api-version=2024-12-01-preview`;
            payload = {
                stream: true,
                messages: openAiMessages,
                max_tokens: model.info.maxTokens,
                temperature: 0.0,
                frequency_penalty: 0,
                presence_penalty: 0,
                stop: null,
                stream_options: { include_usage: true },
            };
            if (["o1", "o3-mini", "o3", "o4-mini", "gpt-5", "gpt-5-nano", "gpt-5-mini"].includes(model.id)) {
                delete payload.max_tokens;
                delete payload.temperature;
                // Add reasoning effort for reasoning models
                if (this.options.reasoningEffort) {
                    payload.reasoning_effort = this.options.reasoningEffort;
                }
            }
            if (model.id === "o3-mini") {
                delete payload.stream;
                delete payload.stream_options;
            }
        }
        else if (perplexityModels.includes(model.id)) {
            const openAiMessages = [
                { role: "system", content: systemPrompt },
                ...convertToOpenAiMessages(messages),
            ];
            url = `${this.options.sapAiCoreBaseUrl}/v2/inference/deployments/${deploymentId}/chat/completions`;
            payload = {
                stream: true,
                messages: openAiMessages,
                temperature: 0.0,
                frequency_penalty: 0,
                presence_penalty: 0,
                stop: null,
                model: model.id,
                stream_options: { include_usage: true },
            };
        }
        else if (geminiModels.includes(model.id)) {
            url = `${this.options.sapAiCoreBaseUrl}/v2/inference/deployments/${deploymentId}/models/${model.id}:streamGenerateContent`;
            payload = Gemini.prepareRequestPayload(systemPrompt, messages, model);
        }
        else {
            throw new Error(`Unsupported model: ${model.id}`);
        }
        try {
            const response = await axios.post(url, JSON.stringify(payload, null, 2), {
                headers,
                responseType: "stream",
                ...getAxiosSettings(),
            });
            if (model.id === "o3-mini") {
                const response = await axios.post(url, JSON.stringify(payload, null, 2), { headers, ...getAxiosSettings() });
                // Yield the usage information
                if (response.data.usage) {
                    yield {
                        type: "usage",
                        inputTokens: response.data.usage.prompt_tokens,
                        outputTokens: response.data.usage.completion_tokens,
                    };
                }
                // Yield the content
                if (response.data.choices && response.data.choices.length > 0) {
                    yield {
                        type: "text",
                        text: response.data.choices[0].message.content,
                    };
                }
                // Final usage yield
                if (response.data.usage) {
                    yield {
                        type: "usage",
                        inputTokens: response.data.usage.prompt_tokens,
                        outputTokens: response.data.usage.completion_tokens,
                    };
                }
            }
            else if (openAIModels.includes(model.id) || perplexityModels.includes(model.id)) {
                yield* this.streamCompletionGPT(response.data, model);
            }
            else if (model.id === "anthropic--claude-4.5-opus" ||
                model.id === "anthropic--claude-4.6-sonnet" ||
                model.id === "anthropic--claude-4.5-sonnet" ||
                model.id === "anthropic--claude-4.5-haiku" ||
                model.id === "anthropic--claude-4-sonnet" ||
                model.id === "anthropic--claude-4-opus" ||
                model.id === "anthropic--claude-3.7-sonnet") {
                yield* this.streamCompletionSonnet37(response.data, model);
            }
            else if (geminiModels.includes(model.id)) {
                yield* this.streamCompletionGemini(response.data, model);
            }
            else {
                yield* this.streamCompletion(response.data, model);
            }
        }
        catch (error) {
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                Logger.error("Error status:", error.response.status);
                Logger.error("Error headers:", error.response.headers);
                // Handle error data - need to read stream if responseType was 'stream'
                let errorMessage = "Unknown error";
                if (error.response.data) {
                    try {
                        // If it's a stream, read it
                        if (typeof error.response.data.on === "function" ||
                            typeof error.response.data[Symbol.asyncIterator] === "function") {
                            const chunks = [];
                            for await (const chunk of error.response.data) {
                                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                            }
                            const fullData = Buffer.concat(chunks).toString("utf-8");
                            errorMessage = fullData;
                            try {
                                // Try to parse as JSON for better formatting
                                const jsonError = JSON.parse(fullData);
                                errorMessage = JSON.stringify(jsonError, null, 2);
                            }
                            catch {
                                // Keep as plain text if not JSON
                            }
                        }
                        else if (typeof error.response.data === "string") {
                            errorMessage = error.response.data;
                        }
                        else if (typeof error.response.data === "object") {
                            errorMessage = JSON.stringify(error.response.data, null, 2);
                        }
                        Logger.error("Error data:", errorMessage);
                    }
                    catch (e) {
                        Logger.error("Failed to read error data:", e);
                        Logger.error("Raw error data:", error.response.data);
                    }
                }
                if (error.response.status === 404) {
                    throw new Error(`404 Not Found: ${errorMessage}`);
                }
                if (error.response.status === 400) {
                    throw new Error(`400 Bad Request: ${errorMessage}`);
                }
                throw new Error(`HTTP ${error.response.status}: ${errorMessage}`);
            }
            if (error.request) {
                // The request was made but no response was received
                Logger.error("Error request:", error.request);
                throw new Error("No response received from server");
            }
            // Something happened in setting up the request that triggered an Error
            Logger.error("Error message:", error.message);
            throw new Error(`Error setting up request: ${error.message}`);
        }
    }
    async *streamCompletion(stream, _model) {
        const usage = { input_tokens: 0, output_tokens: 0 };
        try {
            for await (const chunk of stream) {
                const chunkStr = this.chunkToString(chunk);
                const lines = chunkStr.split("\n").filter(Boolean);
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const jsonData = line.slice(6);
                        try {
                            const data = JSON.parse(jsonData);
                            if (data.type === "message_start") {
                                usage.input_tokens = data.message.usage.input_tokens;
                                yield {
                                    type: "usage",
                                    inputTokens: usage.input_tokens,
                                    outputTokens: usage.output_tokens,
                                };
                            }
                            else if (data.type === "content_block_start" || data.type === "content_block_delta") {
                                const contentBlock = data.type === "content_block_start" ? data.content_block : data.delta;
                                if (contentBlock.type === "text" || contentBlock.type === "text_delta") {
                                    yield {
                                        type: "text",
                                        text: contentBlock.text || "",
                                    };
                                }
                            }
                            else if (data.type === "message_delta") {
                                if (data.usage) {
                                    usage.output_tokens = data.usage.output_tokens;
                                    yield {
                                        type: "usage",
                                        inputTokens: 0,
                                        outputTokens: data.usage.output_tokens,
                                    };
                                }
                            }
                        }
                        catch (error) {
                            Logger.error("Failed to parse JSON data:", error);
                        }
                    }
                }
            }
        }
        catch (error) {
            Logger.error("Error streaming completion:", error);
            throw error;
        }
    }
    async *streamCompletionSonnet37(stream, _model) {
        const _usage = { input_tokens: 0, output_tokens: 0 };
        try {
            // Iterate over the stream and process each chunk
            for await (const chunk of stream) {
                const chunkStr = this.chunkToString(chunk);
                const lines = chunkStr.split("\n").filter(Boolean);
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const jsonData = line.slice(6);
                        try {
                            // Parse the incoming JSON data from the stream
                            // Using JSON5 to handle relaxed JSON syntax (e.g., single quotes)
                            const data = JSON5.parse(jsonData);
                            // Handle metadata (token usage)
                            if (data.metadata?.usage) {
                                // inputTokens does not include cached write/read tokens
                                let inputTokens = data.metadata.usage.inputTokens || 0;
                                const outputTokens = data.metadata.usage.outputTokens || 0;
                                const cacheReadInputTokens = data.metadata.usage.cacheReadInputTokens || 0;
                                const cacheWriteInputTokens = data.metadata.usage.cacheWriteInputTokens || 0;
                                inputTokens = inputTokens + cacheReadInputTokens + cacheWriteInputTokens;
                                yield {
                                    type: "usage",
                                    inputTokens,
                                    outputTokens,
                                };
                            }
                            // Handle content block delta (text generation)
                            if (data.contentBlockDelta) {
                                if (data.contentBlockDelta?.delta?.text) {
                                    yield {
                                        type: "text",
                                        text: data.contentBlockDelta.delta.text,
                                    };
                                }
                                // Handle reasoning content if present
                                if (data.contentBlockDelta?.delta?.reasoningContent?.text) {
                                    yield {
                                        type: "reasoning",
                                        reasoning: data.contentBlockDelta.delta.reasoningContent.text,
                                    };
                                }
                            }
                        }
                        catch (error) {
                            Logger.error("Failed to parse JSON data:", error);
                            yield {
                                type: "text",
                                text: `[ERROR] Failed to parse response data: ${error instanceof Error ? error.message : String(error)}`,
                            };
                        }
                    }
                }
            }
        }
        catch (error) {
            Logger.error("Error streaming completion:", error);
            yield {
                type: "text",
                text: `[ERROR] Failed to process stream: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async *streamCompletionGPT(stream, _model) {
        let _currentContent = "";
        let inputTokens = 0;
        let outputTokens = 0;
        try {
            for await (const chunk of stream) {
                const chunkStr = this.chunkToString(chunk);
                const lines = chunkStr.split("\n").filter(Boolean);
                for (const line of lines) {
                    if (line.trim() === "data: [DONE]") {
                        // End of stream, yield final usage
                        yield {
                            type: "usage",
                            inputTokens,
                            outputTokens,
                        };
                        return;
                    }
                    if (line.startsWith("data: ")) {
                        const jsonData = line.slice(6);
                        try {
                            const data = JSON.parse(jsonData);
                            if (data.choices && data.choices.length > 0) {
                                const choice = data.choices[0];
                                if (choice.delta && choice.delta.content) {
                                    yield {
                                        type: "text",
                                        text: choice.delta.content,
                                    };
                                    _currentContent += choice.delta.content;
                                }
                            }
                            // Handle usage information
                            if (data.usage) {
                                inputTokens = data.usage.prompt_tokens || inputTokens;
                                outputTokens = data.usage.completion_tokens || outputTokens;
                                yield {
                                    type: "usage",
                                    inputTokens,
                                    outputTokens,
                                };
                            }
                            if (data.choices?.[0]?.finish_reason === "stop") {
                                // Final usage yield, if not already provided
                                if (!data.usage) {
                                    yield {
                                        type: "usage",
                                        inputTokens,
                                        outputTokens,
                                    };
                                }
                            }
                        }
                        catch (error) {
                            Logger.error("Failed to parse GPT JSON data:", error);
                        }
                    }
                }
            }
        }
        catch (error) {
            Logger.error("Error streaming GPT completion:", error);
            throw error;
        }
    }
    async *streamCompletionGemini(stream, _model) {
        let promptTokens = 0;
        let outputTokens = 0;
        let cacheReadTokens = 0;
        let thoughtsTokenCount = 0;
        try {
            for await (const chunk of stream) {
                const chunkStr = this.chunkToString(chunk);
                const lines = chunkStr.split("\n").filter(Boolean);
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const jsonData = line.slice(6);
                        try {
                            const data = JSON.parse(jsonData);
                            // Use Gemini namespace to process the chunk
                            const processed = Gemini.processStreamChunk(data);
                            // Yield reasoning if present
                            if (processed.reasoning) {
                                yield {
                                    type: "reasoning",
                                    reasoning: processed.reasoning,
                                };
                            }
                            // Yield text if present
                            if (processed.text) {
                                yield {
                                    type: "text",
                                    text: processed.text,
                                };
                            }
                            if (processed.usageMetadata) {
                                promptTokens = processed.usageMetadata.promptTokenCount ?? promptTokens;
                                outputTokens = processed.usageMetadata.candidatesTokenCount ?? outputTokens;
                                thoughtsTokenCount = processed.usageMetadata.thoughtsTokenCount ?? thoughtsTokenCount;
                                cacheReadTokens = processed.usageMetadata.cachedContentTokenCount ?? cacheReadTokens;
                                yield {
                                    type: "usage",
                                    inputTokens: promptTokens - cacheReadTokens,
                                    outputTokens,
                                    thoughtsTokenCount,
                                    cacheReadTokens,
                                    cacheWriteTokens: 0,
                                };
                            }
                        }
                        catch (error) {
                            Logger.error("Failed to parse Gemini JSON data:", error);
                        }
                    }
                }
            }
        }
        catch (error) {
            Logger.error("Error streaming Gemini completion:", error);
            throw error;
        }
    }
    createUserReadableRequest(userContent) {
        return {
            model: this.getModel().id,
            max_tokens: this.getModel().info.maxTokens,
            system: "(see SYSTEM_PROMPT in src/ClaudeDev.ts)",
            messages: [{ conversation_history: "..." }, { role: "user", content: userContent }],
            tools: "(see tools in src/ClaudeDev.ts)",
            tool_choice: { type: "auto" },
        };
    }
    getModel() {
        const modelId = this.options.apiModelId;
        if (modelId && modelId in sapAiCoreModels) {
            const id = modelId;
            return { id, info: sapAiCoreModels[id] };
        }
        return { id: sapAiCoreDefaultModelId, info: sapAiCoreModels[sapAiCoreDefaultModelId] };
    }
    convertMessageParamToSAPMessages(messages) {
        // Use the existing OpenAI converter since the logic is identical
        return convertToOpenAiMessages(messages);
    }
}
__decorate([
    withRetry()
], SapAiCoreHandler.prototype, "createMessage", null);
//# sourceMappingURL=sapaicore.js.map