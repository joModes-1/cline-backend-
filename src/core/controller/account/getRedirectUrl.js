import { HostProvider } from "@/hosts/host-provider";
/**
 * Constructs and returns a URL that will redirect to the user's IDE.
 */
export async function getRedirectUrl(_controller, _) {
    const url = (await HostProvider.env.getIdeRedirectUri({})).value;
    return { value: url };
}
//# sourceMappingURL=getRedirectUrl.js.map