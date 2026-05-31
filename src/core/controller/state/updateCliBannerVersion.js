import { Empty } from "@shared/proto/cline/common";
/**
 * Updates the CLI banner version to hide it
 * @param controller The controller instance
 * @param request The request containing the version number
 * @returns Empty response
 */
export async function updateCliBannerVersion(controller, request) {
    // Save the banner version to global state to hide it
    controller.stateManager.setGlobalState("lastDismissedCliBannerVersion", request.value ?? 1);
    // Update webview
    await controller.postStateToWebview();
    return Empty.create();
}
//# sourceMappingURL=updateCliBannerVersion.js.map