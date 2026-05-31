import { loadMcpDocumentation } from "@core/prompts/loadMcpDocumentation";
import { ClineDefaultTool } from "@/shared/tools";
export class LoadMcpDocumentationHandler {
    name = ClineDefaultTool.MCP_DOCS;
    constructor() { }
    getDescription(block) {
        return `[${block.name}]`;
    }
    async handlePartialBlock(_block, uiHelpers) {
        // Show loading message for partial blocks (though this tool probably won't have partials)
        await uiHelpers.say(this.name, "", undefined, undefined, true);
    }
    async execute(config, _block) {
        // Show loading message at start of execution (self-managed now)
        await config.callbacks.say(this.name, "", undefined, undefined, false);
        config.taskState.consecutiveMistakeCount = 0;
        try {
            // Load MCP documentation
            const documentation = await loadMcpDocumentation(config.services.mcpHub);
            return documentation;
        }
        catch (error) {
            return `Error loading MCP documentation: ${error?.message}`;
        }
    }
}
//# sourceMappingURL=LoadMcpDocumentationHandler.js.map