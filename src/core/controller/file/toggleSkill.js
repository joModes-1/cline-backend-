import { SkillsToggles } from "@shared/proto/cline/file";
import { Logger } from "@/shared/services/Logger";
/**
 * Toggles a skill on or off
 * @param controller The controller instance
 * @param request The request containing the skill path and enabled state
 * @returns The updated skills toggles
 */
export async function toggleSkill(controller, request) {
    const { skillPath, isGlobal, enabled } = request;
    if (!skillPath || typeof enabled !== "boolean" || typeof isGlobal !== "boolean") {
        Logger.error("toggleSkill: Missing or invalid parameters", {
            skillPath,
            isGlobal,
            enabled: typeof enabled === "boolean" ? enabled : `Invalid: ${typeof enabled}`,
        });
        throw new Error("Missing or invalid parameters for toggleSkill");
    }
    let globalToggles = controller.stateManager.getGlobalSettingsKey("globalSkillsToggles") || {};
    let localToggles = controller.stateManager.getWorkspaceStateKey("localSkillsToggles") || {};
    if (isGlobal) {
        globalToggles = { ...globalToggles, [skillPath]: enabled };
        controller.stateManager.setGlobalState("globalSkillsToggles", globalToggles);
    }
    else {
        localToggles = { ...localToggles, [skillPath]: enabled };
        controller.stateManager.setWorkspaceState("localSkillsToggles", localToggles);
    }
    await controller.postStateToWebview();
    return SkillsToggles.create({
        globalSkillsToggles: globalToggles,
        localSkillsToggles: localToggles,
    });
}
//# sourceMappingURL=toggleSkill.js.map