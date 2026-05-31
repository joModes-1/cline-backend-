/**
 * Utility to fetch and cache OpenRouter models for the CLI
 */
import { openRouterDefaultModelId } from "@/shared/api";
import { fetch } from "@/shared/net";
import { Logger } from "@/shared/services/Logger";
// In-memory cache
let cachedModels = null;
let fetchPromise = null;
/**
 * Fetch OpenRouter models from the API
 * Returns cached results if available, or fetches from API
 */
export async function fetchOpenRouterModels() {
    // Return cached models if available
    if (cachedModels) {
        return cachedModels;
    }
    // If already fetching, wait for that promise
    if (fetchPromise) {
        return fetchPromise;
    }
    // Start fetching
    fetchPromise = (async () => {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models");
            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.status}`);
            }
            const data = (await response.json());
            if (data?.data) {
                const models = data.data.map((m) => m.id).sort((a, b) => a.localeCompare(b));
                cachedModels = models;
                return models;
            }
            return [];
        }
        catch (error) {
            Logger.debug("Failed to fetch OpenRouter models:", error);
            return [];
        }
        finally {
            fetchPromise = null;
        }
    })();
    return fetchPromise;
}
/**
 * Get the default OpenRouter model ID
 */
export function getOpenRouterDefaultModelId() {
    return openRouterDefaultModelId;
}
/**
 * Check if provider uses OpenRouter models (openrouter or cline)
 */
export function usesOpenRouterModels(provider) {
    return provider === "openrouter" || provider === "cline";
}
//# sourceMappingURL=openrouter-models.js.map