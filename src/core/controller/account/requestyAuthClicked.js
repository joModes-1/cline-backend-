import { HostProvider } from "@/hosts/host-provider";
import { toRequestyServiceUrl } from "@/shared/clients/requesty";
import { openExternal } from "@/utils/env";
/**
 * Initiates Requesty auth with optional custom base URL
 */
export async function requestyAuthClicked(_, req) {
    const customBaseUrl = req.value || undefined;
    const callbackUrl = await HostProvider.get().getCallbackUrl("/requesty");
    const baseUrl = toRequestyServiceUrl(customBaseUrl, "app");
    if (!baseUrl) {
        throw new Error("Invalid Requesty base URL");
    }
    const authUrl = new URL("oauth/authorize", baseUrl);
    authUrl.searchParams.set("callback_url", callbackUrl);
    await openExternal(authUrl.toString());
    return {};
}
//# sourceMappingURL=requestyAuthClicked.js.map