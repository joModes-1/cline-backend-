// Define available tool ids
export var ClineDefaultTool;
(function (ClineDefaultTool) {
    ClineDefaultTool["ASK"] = "ask_followup_question";
    ClineDefaultTool["ATTEMPT"] = "attempt_completion";
    ClineDefaultTool["BASH"] = "execute_command";
    ClineDefaultTool["FILE_EDIT"] = "replace_in_file";
    ClineDefaultTool["FILE_READ"] = "read_file";
    ClineDefaultTool["FILE_NEW"] = "write_to_file";
    ClineDefaultTool["SEARCH"] = "search_files";
    ClineDefaultTool["LIST_FILES"] = "list_files";
    ClineDefaultTool["LIST_CODE_DEF"] = "list_code_definition_names";
    ClineDefaultTool["BROWSER"] = "browser_action";
    ClineDefaultTool["MCP_USE"] = "use_mcp_tool";
    ClineDefaultTool["MCP_ACCESS"] = "access_mcp_resource";
    ClineDefaultTool["MCP_DOCS"] = "load_mcp_documentation";
    ClineDefaultTool["NEW_TASK"] = "new_task";
    ClineDefaultTool["PLAN_MODE"] = "plan_mode_respond";
    ClineDefaultTool["ACT_MODE"] = "act_mode_respond";
    ClineDefaultTool["TODO"] = "focus_chain";
    ClineDefaultTool["WEB_FETCH"] = "web_fetch";
    ClineDefaultTool["WEB_SEARCH"] = "web_search";
    ClineDefaultTool["CONDENSE"] = "condense";
    ClineDefaultTool["SUMMARIZE_TASK"] = "summarize_task";
    ClineDefaultTool["REPORT_BUG"] = "report_bug";
    ClineDefaultTool["NEW_RULE"] = "new_rule";
    ClineDefaultTool["APPLY_PATCH"] = "apply_patch";
    ClineDefaultTool["GENERATE_EXPLANATION"] = "generate_explanation";
    ClineDefaultTool["USE_SKILL"] = "use_skill";
    ClineDefaultTool["USE_SUBAGENTS"] = "use_subagents";
})(ClineDefaultTool || (ClineDefaultTool = {}));
// Array of all tool names for compatibility
// Automatically generated from the enum values
export const toolUseNames = Object.values(ClineDefaultTool);
const dynamicToolUseNamesByNamespace = new Map();
export function setDynamicToolUseNames(namespace, names) {
    dynamicToolUseNamesByNamespace.set(namespace, new Set(names.map((name) => name.trim()).filter(Boolean)));
}
export function getToolUseNames() {
    const defaults = [...toolUseNames];
    const dynamic = Array.from(dynamicToolUseNamesByNamespace.values()).flatMap((set) => Array.from(set));
    return Array.from(new Set([...defaults, ...dynamic]));
}
// Tools that are safe to run in parallel with the initial checkpoint commit
// These are tools that do not modify the workspace state
export const READ_ONLY_TOOLS = [
    ClineDefaultTool.LIST_FILES,
    ClineDefaultTool.FILE_READ,
    ClineDefaultTool.SEARCH,
    ClineDefaultTool.LIST_CODE_DEF,
    ClineDefaultTool.BROWSER,
    ClineDefaultTool.ASK,
    ClineDefaultTool.WEB_SEARCH,
    ClineDefaultTool.WEB_FETCH,
    ClineDefaultTool.USE_SKILL,
    ClineDefaultTool.USE_SUBAGENTS,
];
//# sourceMappingURL=tools.js.map