import { Logger } from "@/shared/services/Logger";
/**
 * Helper class to process tool call deltas from OpenAI-compatible streaming responses.
 * Handles accumulating tool call ID and name across multiple delta chunks,
 * and yields properly formatted tool call chunks when arguments are received.
 */
export class ToolCallProcessor {
    toolCallStateByIndex;
    constructor() {
        this.toolCallStateByIndex = new Map();
    }
    /**
     * Process tool call deltas from a chunk and yield formatted tool call chunks.
     * @param toolCallDeltas - Array of tool call deltas from the chunk
     * @yields Formatted tool call chunks ready to be yielded in the API stream
     */
    *processToolCallDeltas(toolCallDeltas) {
        if (!toolCallDeltas) {
            return;
        }
        for (const [fallbackIndex, toolCallDelta] of toolCallDeltas.entries()) {
            // OpenAI-style streams include an index per tool call. Use iteration order as a fallback.
            const toolCallIndex = toolCallDelta.index ?? fallbackIndex;
            const toolCallState = this.getOrCreateToolCallState(toolCallIndex);
            // Accumulate the tool call ID if present
            if (toolCallDelta.id) {
                toolCallState.id = toolCallDelta.id;
            }
            // Accumulate the function name if present
            if (toolCallDelta.function?.name) {
                Logger.debug(`[ToolCallProcessor] Native Tool Called: ${toolCallDelta.function.name}`);
                toolCallState.name = toolCallDelta.function.name;
            }
            // Only yield when we have all required fields: id, name, and arguments
            if (toolCallState.id && toolCallState.name && toolCallDelta.function?.arguments) {
                yield {
                    type: "tool_calls",
                    tool_call: {
                        ...toolCallDelta,
                        function: {
                            ...toolCallDelta.function,
                            id: toolCallState.id,
                            name: toolCallState.name,
                        },
                    },
                };
            }
        }
    }
    getOrCreateToolCallState(index) {
        const existingState = this.toolCallStateByIndex.get(index);
        if (existingState) {
            return existingState;
        }
        const initialState = { id: "", name: "" };
        this.toolCallStateByIndex.set(index, initialState);
        return initialState;
    }
    /**
     * Reset the internal state. Call this when starting a new message.
     */
    reset() {
        this.toolCallStateByIndex.clear();
    }
    /**
     * Get the current accumulated tool call state (useful for debugging).
     */
    getState() {
        return Object.fromEntries(this.toolCallStateByIndex.entries());
    }
}
export function getOpenAIToolParams(tools, enableParallelToolCalls = false) {
    if (!tools?.length) {
        return {
            tools: undefined,
        };
    }
    return {
        tools,
        tool_choice: "auto",
        parallel_tool_calls: enableParallelToolCalls,
    };
}
//# sourceMappingURL=tool-call-processor.js.map