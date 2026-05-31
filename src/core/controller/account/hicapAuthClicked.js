import { HostProvider } from "@/hosts/host-provider";
import { openExternal } from "@/utils/env";
/**
 * Initiates Hicap auth
 */
export async function hicapAuthClicked(_, __) {
    const callbackUrl = await HostProvider.get().getCallbackUrl("/hicap");
    const authUrl = new URL("https://dashboard.hicap.ai/setup");
    authUrl.searchParams.set("application", "cline");
    authUrl.searchParams.set("callback_url", callbackUrl);
    await openExternal(authUrl.toString());
    return {};
}
//# sourceMappingURL=hicapAuthClicked.js.map