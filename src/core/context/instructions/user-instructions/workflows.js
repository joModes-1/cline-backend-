import { synchronizeRuleToggles } from "@core/context/instructions/user-instructions/rule-helpers";
import { ensureWorkflowsDirectoryExists, GlobalFileNames } from "@core/storage/disk";
import path from "path";
/**
 * Refresh the workflow toggles
 */
export async function refreshWorkflowToggles(controller, workingDirectory) {
    // Global workflows
    const globalWorkflowToggles = controller.stateManager.getGlobalSettingsKey("globalWorkflowToggles");
    const globalClineWorkflowsFilePath = await ensureWorkflowsDirectoryExists();
    const updatedGlobalWorkflowToggles = await synchronizeRuleToggles(globalClineWorkflowsFilePath, globalWorkflowToggles);
    controller.stateManager.setGlobalState("globalWorkflowToggles", updatedGlobalWorkflowToggles);
    const workflowRulesToggles = controller.stateManager.getWorkspaceStateKey("workflowToggles");
    const workflowsDirPath = path.resolve(workingDirectory, GlobalFileNames.workflows);
    const updatedWorkflowToggles = await synchronizeRuleToggles(workflowsDirPath, workflowRulesToggles);
    controller.stateManager.setWorkspaceState("workflowToggles", updatedWorkflowToggles);
    return {
        globalWorkflowToggles: updatedGlobalWorkflowToggles,
        localWorkflowToggles: updatedWorkflowToggles,
    };
}
//# sourceMappingURL=workflows.js.map