import { BannerService } from "@/services/banner/BannerService";
import { Logger } from "@/shared/services/Logger";
/**
 * Dismisses a banner and sends telemetry
 * @param controller The controller instance
 * @param request The request containing the banner ID to dismiss
 * @returns Empty response
 */
export async function dismissBanner(controller, request) {
    const bannerId = request.value;
    if (!bannerId) {
        return {};
    }
    try {
        await BannerService.get().dismissBanner(bannerId);
        await controller.postStateToWebview();
    }
    catch (error) {
        Logger.error("Failed to dismiss banner:", error);
    }
    return {};
}
//# sourceMappingURL=dismissBanner.js.map