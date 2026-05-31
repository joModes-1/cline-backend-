import { fetchRemoteConfig } from "@/core/storage/remote-config/fetch";
/**
 * Handles setting the user's active organization
 * @param controller The controller instance
 * @param request UserOrganization to set as active
 * @returns Empty response
 */
export async function setUserOrganization(controller, request) {
    try {
        if (!controller.accountService) {
            throw new Error("Account service not available");
        }
        // Switch to the specified organization using the account service
        await controller.accountService.switchAccount(request.organizationId);
        await fetchRemoteConfig(controller);
        return {};
    }
    catch (error) {
        throw error;
    }
}
//# sourceMappingURL=setUserOrganization.js.map