export const OPENAI_REASONING_EFFORT_OPTIONS = ["none", "low", "medium", "high", "xhigh"];
export function isOpenaiReasoningEffort(value) {
    return typeof value === "string" && OPENAI_REASONING_EFFORT_OPTIONS.includes(value);
}
export function normalizeOpenaiReasoningEffort(effort) {
    const value = (effort || "medium").toLowerCase();
    return isOpenaiReasoningEffort(value) ? value : "medium";
}
//# sourceMappingURL=types.js.map