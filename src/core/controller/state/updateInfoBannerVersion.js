import { Empty } from "@shared/proto/cline/common";
/**
 * Updates the info banner version to track which version the user has dismissed
 * @param controller The controller instance
 * @param request The request containing the version number
 * @returns Empty response
 */
export async function updateInfoBannerVersion(controller, request) {
    const version = Number(request.value);
    controller.stateManager.setGlobalState("lastDismissedInfoBannerVersion", version);
    await controller.postStateToWebview();
    return Empty.create();
}
//# sourceMappingURL=updateInfoBannerVersion.js.map