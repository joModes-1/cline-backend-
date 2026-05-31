import { AuthService } from "@/services/auth/AuthService";
/**
 * Handles the user clicking the login link in the UI.
 * Generates a secure nonce for state validation, stores it in secrets,
 * and opens the authentication URL in the external browser.
 *
 * @param controller The controller instance.
 * @returns The login URL as a string.
 */
export async function accountLoginClicked(_controller, _) {
    return await AuthService.getInstance().createAuthRequest();
}
//# sourceMappingURL=accountLoginClicked.js.map