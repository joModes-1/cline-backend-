import { CLINE_MCP_TOOL_IDENTIFIER } from "@/shared/mcp";
import { ClineDefaultTool } from "@/shared/tools";
import { AccessMcpResourceHandler } from "./handlers/AccessMcpResourceHandler";
import { ActModeRespondHandler } from "./handlers/ActModeRespondHandler";
import { ApplyPatchHandler } from "./handlers/ApplyPatchHandler";
import { AskFollowupQuestionToolHandler } from "./handlers/AskFollowupQuestionToolHandler";
import { AttemptCompletionHandler } from "./handlers/AttemptCompletionHandler";
import { BrowserToolHandler } from "./handlers/BrowserToolHandler";
import { CondenseHandler } from "./handlers/CondenseHandler";
import { ExecuteCommandToolHandler } from "./handlers/ExecuteCommandToolHandler";
import { GenerateExplanationToolHandler } from "./handlers/GenerateExplanationToolHandler";
import { ListCodeDefinitionNamesToolHandler } from "./handlers/ListCodeDefinitionNamesToolHandler";
import { ListFilesToolHandler } from "./handlers/ListFilesToolHandler";
import { LoadMcpDocumentationHandler } from "./handlers/LoadMcpDocumentationHandler";
import { NewTaskHandler } from "./handlers/NewTaskHandler";
import { PlanModeRespondHandler } from "./handlers/PlanModeRespondHandler";
import { ReadFileToolHandler } from "./handlers/ReadFileToolHandler";
import { ReportBugHandler } from "./handlers/ReportBugHandler";
import { SearchFilesToolHandler } from "./handlers/SearchFilesToolHandler";
import { UseSubagentsToolHandler } from "./handlers/SubagentToolHandler";
import { SummarizeTaskHandler } from "./handlers/SummarizeTaskHandler";
import { UseMcpToolHandler } from "./handlers/UseMcpToolHandler";
import { UseSkillToolHandler } from "./handlers/UseSkillToolHandler";
import { WebFetchToolHandler } from "./handlers/WebFetchToolHandler";
import { WebSearchToolHandler } from "./handlers/WebSearchToolHandler";
import { WriteToFileToolHandler } from "./handlers/WriteToFileToolHandler";
import { AgentConfigLoader } from "./subagent/AgentConfigLoader";
/**
 * A wrapper class that allows a single tool handler to be registered under multiple names.
 * This provides proper typing for tools that share the same implementation logic.
 */
export class SharedToolHandler {
    name;
    baseHandler;
    constructor(name, baseHandler) {
        this.name = name;
        this.baseHandler = baseHandler;
    }
    getDescription(block) {
        return this.baseHandler.getDescription(block);
    }
    async execute(config, block) {
        return this.baseHandler.execute(config, block);
    }
    async handlePartialBlock(block, uiHelpers) {
        return this.baseHandler.handlePartialBlock(block, uiHelpers);
    }
}
/**
 * Coordinates tool execution by routing to registered handlers.
 * Falls back to legacy switch for unregistered tools.
 */
export class ToolExecutorCoordinator {
    handlers = new Map();
    dynamicSubagentHandlers = new Map();
    toolHandlersMap = {
        [ClineDefaultTool.ASK]: (_v) => new AskFollowupQuestionToolHandler(),
        [ClineDefaultTool.ATTEMPT]: (_v) => new AttemptCompletionHandler(),
        [ClineDefaultTool.BASH]: (v) => new ExecuteCommandToolHandler(v),
        [ClineDefaultTool.FILE_EDIT]: (v) => new SharedToolHandler(ClineDefaultTool.FILE_EDIT, new WriteToFileToolHandler(v)),
        [ClineDefaultTool.FILE_READ]: (v) => new ReadFileToolHandler(v),
        [ClineDefaultTool.FILE_NEW]: (v) => new WriteToFileToolHandler(v),
        [ClineDefaultTool.SEARCH]: (v) => new SearchFilesToolHandler(v),
        [ClineDefaultTool.LIST_FILES]: (v) => new ListFilesToolHandler(v),
        [ClineDefaultTool.LIST_CODE_DEF]: (v) => new ListCodeDefinitionNamesToolHandler(v),
        [ClineDefaultTool.BROWSER]: (_v) => new BrowserToolHandler(),
        [ClineDefaultTool.MCP_USE]: (_v) => new UseMcpToolHandler(),
        [ClineDefaultTool.MCP_ACCESS]: (_v) => new AccessMcpResourceHandler(),
        [ClineDefaultTool.MCP_DOCS]: (_v) => new LoadMcpDocumentationHandler(),
        [ClineDefaultTool.NEW_TASK]: (_v) => new NewTaskHandler(),
        [ClineDefaultTool.PLAN_MODE]: (_v) => new PlanModeRespondHandler(),
        [ClineDefaultTool.ACT_MODE]: (_v) => new ActModeRespondHandler(),
        [ClineDefaultTool.TODO]: (_v) => undefined,
        [ClineDefaultTool.WEB_FETCH]: (_v) => new WebFetchToolHandler(),
        [ClineDefaultTool.WEB_SEARCH]: (_v) => new WebSearchToolHandler(),
        [ClineDefaultTool.CONDENSE]: (_v) => new CondenseHandler(),
        [ClineDefaultTool.SUMMARIZE_TASK]: (_v) => new SummarizeTaskHandler(_v),
        [ClineDefaultTool.REPORT_BUG]: (_v) => new ReportBugHandler(),
        [ClineDefaultTool.NEW_RULE]: (v) => new SharedToolHandler(ClineDefaultTool.NEW_RULE, new WriteToFileToolHandler(v)),
        [ClineDefaultTool.APPLY_PATCH]: (_v) => new ApplyPatchHandler(_v),
        [ClineDefaultTool.GENERATE_EXPLANATION]: (_v) => new GenerateExplanationToolHandler(),
        [ClineDefaultTool.USE_SKILL]: (_v) => new UseSkillToolHandler(),
        [ClineDefaultTool.USE_SUBAGENTS]: (_v) => new UseSubagentsToolHandler(),
    };
    /**
     * Register a tool handler
     */
    register(handler) {
        this.handlers.set(handler.name, handler);
    }
    registerByName(toolName, validator) {
        const handler = this.toolHandlersMap[toolName]?.(validator);
        if (handler) {
            this.register(handler);
        }
    }
    /**
     * Check if a handler is registered for the given tool
     */
    has(toolName) {
        return this.getHandler(toolName) !== undefined;
    }
    /**
     * Get a handler for the given tool name
     */
    getHandler(toolName) {
        // HACK: Normalize MCP tool names to the standard handler
        if (toolName.includes(CLINE_MCP_TOOL_IDENTIFIER)) {
            toolName = ClineDefaultTool.MCP_USE;
        }
        const staticHandler = this.handlers.get(toolName);
        if (staticHandler) {
            return staticHandler;
        }
        if (AgentConfigLoader.getInstance().isDynamicSubagentTool(toolName)) {
            const existingHandler = this.dynamicSubagentHandlers.get(toolName);
            if (existingHandler) {
                return existingHandler;
            }
            const handler = new SharedToolHandler(toolName, new UseSubagentsToolHandler());
            this.dynamicSubagentHandlers.set(toolName, handler);
            return handler;
        }
        return undefined;
    }
    /**
     * Execute a tool through its registered handler
     */
    async execute(config, block) {
        const handler = this.getHandler(block.name);
        if (!handler) {
            throw new Error(`No handler registered for tool: ${block.name}`);
        }
        return handler.execute(config, block);
    }
}
//# sourceMappingURL=ToolExecutorCoordinator.js.map