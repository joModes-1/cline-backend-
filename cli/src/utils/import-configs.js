/**
 * Utility to detect and import API keys from competing CLI agents (Codex, OpenCode)
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { anthropicDefaultModelId, geminiDefaultModelId, openAiNativeDefaultModelId } from "@/shared/api";
import providersData from "@/shared/providers/providers.json";
// Build provider labels map from providers.json (single source of truth)
const providerLabels = Object.fromEntries(providersData.list.map((p) => [p.value, p.label]));
/**
 * Get possible data directories for OpenCode
 * OpenCode uses XDG_DATA_HOME on all platforms, defaulting to ~/.local/share/opencode
 * Returns array of paths to check (in order of preference)
 */
function getOpenCodeDataDirs() {
    const home = os.homedir();
    const paths = [];
    // XDG path (used by OpenCode on all platforms)
    if (process.env.XDG_DATA_HOME) {
        paths.push(path.join(process.env.XDG_DATA_HOME, "opencode"));
    }
    paths.push(path.join(home, ".local", "share", "opencode"));
    return paths;
}
/**
 * Detect which CLI agents have config files with API keys
 */
export function detectImportSources() {
    return {
        codex: hasCodexConfig(),
        opencode: hasOpenCodeConfig(),
    };
}
/**
 * Check if Codex config exists with API keys
 */
function hasCodexConfig() {
    try {
        const authPath = path.join(os.homedir(), ".codex", "auth.json");
        if (!fs.existsSync(authPath)) {
            return false;
        }
        const content = fs.readFileSync(authPath, "utf-8");
        const data = JSON.parse(content);
        // Check if there's at least one key
        return Object.keys(data).length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Check if OpenCode config exists with API keys
 */
function hasOpenCodeConfig() {
    for (const dir of getOpenCodeDataDirs()) {
        try {
            const authPath = path.join(dir, "auth.json");
            if (!fs.existsSync(authPath)) {
                continue;
            }
            const content = fs.readFileSync(authPath, "utf-8");
            const data = JSON.parse(content);
            // Check if there's at least one key
            if (Object.keys(data).length > 0) {
                return true;
            }
        }
        catch { }
    }
    return false;
}
/**
 * Find the OpenCode auth.json path (first existing one)
 */
function findOpenCodeAuthPath() {
    for (const dir of getOpenCodeDataDirs()) {
        const authPath = path.join(dir, "auth.json");
        if (fs.existsSync(authPath)) {
            return authPath;
        }
    }
    return null;
}
/**
 * Map Codex key names to Cline providers
 */
const CODEX_KEY_MAP = {
    OPENAI_API_KEY: { provider: "openai-native", keyField: "openAiNativeApiKey", modelId: openAiNativeDefaultModelId },
    ANTHROPIC_API_KEY: { provider: "anthropic", keyField: "apiKey", modelId: anthropicDefaultModelId },
};
/**
 * Map OpenCode provider IDs to Cline providers
 */
const OPENCODE_PROVIDER_MAP = {
    openai: { provider: "openai-native", keyField: "openAiNativeApiKey", modelId: openAiNativeDefaultModelId },
    anthropic: { provider: "anthropic", keyField: "apiKey", modelId: anthropicDefaultModelId },
    gemini: { provider: "gemini", keyField: "geminiApiKey", modelId: geminiDefaultModelId },
    mistral: { provider: "mistral", keyField: "mistralApiKey" },
    groq: { provider: "groq", keyField: "groqApiKey" },
    deepseek: { provider: "deepseek", keyField: "deepSeekApiKey" },
    xai: { provider: "xai", keyField: "xaiApiKey" },
    openrouter: { provider: "openrouter", keyField: "openRouterApiKey" },
};
/**
 * Import keys from Codex CLI
 */
export function importFromCodex() {
    try {
        const authPath = path.join(os.homedir(), ".codex", "auth.json");
        if (!fs.existsSync(authPath)) {
            return null;
        }
        const content = fs.readFileSync(authPath, "utf-8");
        const data = JSON.parse(content);
        const keys = [];
        for (const [envKey, apiKey] of Object.entries(data)) {
            const mapping = CODEX_KEY_MAP[envKey];
            if (mapping && apiKey) {
                keys.push({
                    provider: mapping.provider,
                    keyField: mapping.keyField,
                    key: apiKey,
                    modelId: mapping.modelId,
                });
            }
        }
        if (keys.length === 0) {
            return null;
        }
        return { source: "codex", keys };
    }
    catch {
        return null;
    }
}
/**
 * Import keys from OpenCode CLI
 */
export function importFromOpenCode() {
    try {
        const authPath = findOpenCodeAuthPath();
        if (!authPath) {
            return null;
        }
        const content = fs.readFileSync(authPath, "utf-8");
        const data = JSON.parse(content);
        const keys = [];
        for (const [providerId, authEntry] of Object.entries(data)) {
            // Only import API type keys (not OAuth)
            if (authEntry.type !== "api" || !authEntry.key) {
                continue;
            }
            const mapping = OPENCODE_PROVIDER_MAP[providerId];
            if (mapping) {
                keys.push({
                    provider: mapping.provider,
                    keyField: mapping.keyField,
                    key: authEntry.key,
                    modelId: mapping.modelId,
                });
            }
        }
        if (keys.length === 0) {
            return null;
        }
        return { source: "opencode", keys };
    }
    catch {
        return null;
    }
}
/**
 * Get human-readable source name
 */
export function getSourceDisplayName(source) {
    switch (source) {
        case "codex":
            return "OpenAI Codex CLI";
        case "opencode":
            return "OpenCode";
        default:
            return source;
    }
}
/**
 * Get provider display name from providers.json
 */
export function getProviderDisplayName(provider) {
    return providerLabels[provider] || provider;
}
//# sourceMappingURL=import-configs.js.map