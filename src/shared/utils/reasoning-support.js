export function supportsReasoningEffortForModel(modelId) {
    if (!modelId) {
        return false;
    }
    const id = modelId.toLowerCase();
    return (id.includes("gemini") ||
        id.includes("gpt") ||
        id.startsWith("openai/o") ||
        id.includes("/o") ||
        id.startsWith("o") ||
        id.includes("grok"));
}
//# sourceMappingURL=reasoning-support.js.map