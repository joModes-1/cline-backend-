export const REASONING_DETAILS_PROVIDERS = ["cline", "openrouter"];
/**
 * Converts ClineStorageMessage to Anthropic.MessageParam by removing Cline-specific fields
 * Cline-specific fields (like modelInfo, reasoning_details) are properly omitted.
 */
export function convertClineStorageToAnthropicMessage(clineMessage, provider = "anthropic") {
    const { role, content } = clineMessage;
    // Handle string content - fast path
    if (typeof content === "string") {
        return { role, content };
    }
    // Removes thinking block that has no signature (invalid thinking block that's incompatible with Anthropic API)
    const filteredContent = content.filter((b) => b.type !== "thinking" || !!b.signature);
    // Handle array content - strip Cline-specific fields for non-reasoning_details providers
    const shouldCleanContent = !REASONING_DETAILS_PROVIDERS.includes(provider);
    const cleanedContent = shouldCleanContent
        ? filteredContent.map(cleanContentBlock)
        : filteredContent;
    return { role, content: cleanedContent };
}
/**
 * Clean a content block by removing Cline-specific fields and returning only Anthropic-compatible fields
 */
export function cleanContentBlock(block) {
    // Fast path: if no Cline-specific fields exist, return as-is
    const hasClineFields = "reasoning_details" in block ||
        "call_id" in block ||
        "summary" in block ||
        (block.type !== "thinking" && "signature" in block);
    if (!hasClineFields) {
        return block;
    }
    // Removes Cline-specific fields & the signature field that's added for Gemini.
    const { reasoning_details, call_id, summary, ...rest } = block;
    // Remove signature from non-thinking blocks that were added for Gemini
    if (block.type !== "thinking" && rest.signature) {
        rest.signature = undefined;
    }
    return rest;
}
//# sourceMappingURL=content.js.map