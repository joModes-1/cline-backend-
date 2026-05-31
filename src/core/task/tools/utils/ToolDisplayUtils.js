import { removeClosingTag } from "./ToolConstants";
/**
 * Utility functions for tool display and formatting
 */
export class ToolDisplayUtils {
    /**
     * Generate a descriptive string for a tool execution
     * @param block - The tool use block
     * @param coordinator - Optional tool coordinator to get description from tool handler
     */
    static getToolDescription(block, coordinator) {
        // Try to get description from the tool handler first
        if (coordinator) {
            const handler = coordinator.getHandler(block.name);
            if (handler) {
                return handler.getDescription(block);
            }
        }
        return `[${block.name}]`;
    }
    /**
     * Remove partial closing tag from tool parameter text
     * If block is partial, remove partial closing tag so it's not presented to user
     */
    static removeClosingTag(block, tag, text) {
        return removeClosingTag(block, tag, text);
    }
}
//# sourceMappingURL=ToolDisplayUtils.js.map