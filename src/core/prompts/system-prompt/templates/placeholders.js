export var SystemPromptSection;
(function (SystemPromptSection) {
    SystemPromptSection["AGENT_ROLE"] = "AGENT_ROLE_SECTION";
    SystemPromptSection["TOOL_USE"] = "TOOL_USE_SECTION";
    SystemPromptSection["TOOLS"] = "TOOLS_SECTION";
    SystemPromptSection["MCP"] = "MCP_SECTION";
    SystemPromptSection["EDITING_FILES"] = "EDITING_FILES_SECTION";
    SystemPromptSection["ACT_VS_PLAN"] = "ACT_VS_PLAN_SECTION";
    SystemPromptSection["TODO"] = "TODO_SECTION";
    SystemPromptSection["CAPABILITIES"] = "CAPABILITIES_SECTION";
    SystemPromptSection["SKILLS"] = "SKILLS_SECTION";
    SystemPromptSection["RULES"] = "RULES_SECTION";
    SystemPromptSection["SYSTEM_INFO"] = "SYSTEM_INFO_SECTION";
    SystemPromptSection["OBJECTIVE"] = "OBJECTIVE_SECTION";
    SystemPromptSection["USER_INSTRUCTIONS"] = "USER_INSTRUCTIONS_SECTION";
    SystemPromptSection["FEEDBACK"] = "FEEDBACK_SECTION";
    SystemPromptSection["TASK_PROGRESS"] = "TASK_PROGRESS_SECTION";
})(SystemPromptSection || (SystemPromptSection = {}));
/**
 * Standard placeholder definitions used across prompt templates
 */
export const STANDARD_PLACEHOLDERS = {
    // System Information
    OS: "OS",
    SHELL: "SHELL",
    HOME_DIR: "HOME_DIR",
    WORKING_DIR: "WORKING_DIR",
    // MCP Servers
    MCP_SERVERS_LIST: "MCP_SERVERS_LIST",
    // Context Variables
    CWD: "CWD",
    SUPPORTS_BROWSER: "SUPPORTS_BROWSER",
    MODEL_FAMILY: "MODEL_FAMILY",
    // Dynamic Content
    CURRENT_DATE: "CURRENT_DATE",
    ...SystemPromptSection,
};
/**
 * Required placeholders that must be provided for basic prompt functionality
 */
export const REQUIRED_PLACEHOLDERS = [STANDARD_PLACEHOLDERS.AGENT_ROLE, STANDARD_PLACEHOLDERS.SYSTEM_INFO];
/**
 * Optional placeholders that enhance prompt functionality when available
 */
export const OPTIONAL_PLACEHOLDERS = [
    STANDARD_PLACEHOLDERS.FEEDBACK,
    STANDARD_PLACEHOLDERS.USER_INSTRUCTIONS,
    STANDARD_PLACEHOLDERS.TODO,
];
/**
 * Validates that all required placeholders are present in the provided values
 */
export function validateRequiredPlaceholders(placeholders) {
    const missing = [];
    for (const required of REQUIRED_PLACEHOLDERS) {
        if (!(required in placeholders) || placeholders[required] === undefined) {
            missing.push(required);
        }
    }
    return missing;
}
//# sourceMappingURL=placeholders.js.map