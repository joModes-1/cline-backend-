import { Empty } from "@shared/proto/cline/common";
import { AuthService } from "@/services/auth/AuthService";
import { LogoutReason } from "@/services/auth/types";
/**
 * Handles the account logout action
 * @param controller The controller instance
 * @param _request The empty request object
 * @returns Empty response
 */
export async function accountLogoutClicked(controller, _request) {
    await controller.handleSignOut();
    await AuthService.getInstance().handleDeauth(LogoutReason.USER_INITIATED);
    return Empty.create({});
}
//# sourceMappingURL=accountLogoutClicked.js.map