import * as proto from "@/shared/proto";
import { getAvailableTerminalProfiles as getTerminalProfilesFromShell } from "../../../utils/shell";
export async function getAvailableTerminalProfiles(_controller, _request) {
    const profiles = getTerminalProfilesFromShell();
    return proto.cline.TerminalProfiles.create({
        profiles: profiles.map((profile) => ({
            id: profile.id,
            name: profile.name,
            path: profile.path || "",
            description: profile.description || "",
        })),
    });
}
//# sourceMappingURL=getAvailableTerminalProfiles.js.map