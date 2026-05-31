import { Empty } from "@shared/proto/cline/common";
import { fetchRemoteConfig } from "@/core/storage/remote-config/fetch";
/**
 * fetches the remote config
 * @param controller The controller instance
 * @param request Empty request
 * @returns Empty response
 */
export async function refreshRemoteConfig(controller, _) {
    await fetchRemoteConfig(controller);
    return Empty.create();
}
//# sourceMappingURL=refreshRemoteConfig.js.map