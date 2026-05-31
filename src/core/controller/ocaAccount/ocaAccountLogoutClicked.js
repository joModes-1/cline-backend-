import { Empty } from "@shared/proto/cline/common";
/**
 * Handles the account logout action
 * @param controller The controller instance
 * @param _request The empty request object
 * @returns Empty response
 */
export async function ocaAccountLogoutClicked(controller, _request) {
    await controller.handleOcaSignOut();
    return Empty.create({});
}
//# sourceMappingURL=ocaAccountLogoutClicked.js.map