import { Empty } from "@shared/proto/cline/common";
import { openExternal } from "@utils/env";
import { Logger } from "@/shared/services/Logger";
/**
 * Opens a URL in the user's default browser
 * @param controller The controller instance
 * @param request The URL to open
 * @returns Empty response since the client doesn't need a return value
 */
export async function openInBrowser(_controller, request) {
    try {
        if (request.value) {
            await openExternal(request.value);
        }
        return Empty.create();
    }
    catch (error) {
        Logger.error("Error opening URL in browser:", error);
        return Empty.create();
    }
}
//# sourceMappingURL=openInBrowser.js.map