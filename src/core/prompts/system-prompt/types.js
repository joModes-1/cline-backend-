/**
 * Enhanced type definitions for better type safety and developer experience
 */
import { ModelFamily } from "@/shared/prompts";
import { ClineDefaultTool } from "@/shared/tools";
import { SystemPromptSection } from "./templates/placeholders";
// Type guards
export function isValidModelFamily(family) {
    return Object.values(ModelFamily).includes(family);
}
export function isValidSystemPromptSection(section) {
    return Object.values(SystemPromptSection).includes(section);
}
export function isValidClineDefaultTool(tool) {
    return Object.values(ClineDefaultTool).includes(tool);
}
/**
 * Common parameter shared between tools for tracking task progress
 */
export const TASK_PROGRESS_PARAMETER = {
    name: "task_progress",
    required: false,
    instruction: `A checklist showing task progress after this tool use is completed. The task_progress parameter must be included as a separate parameter inside of the parent tool call, it must be separate from other parameters such as content, arguments, etc. (See 'UPDATING TASK PROGRESS' section for more details)`,
    usage: "Checklist here (optional)",
    dependencies: [ClineDefaultTool.TODO],
};
//# sourceMappingURL=types.js.map