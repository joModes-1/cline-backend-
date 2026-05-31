import { PathHashMap } from "@shared/proto/cline/checkpoints";
import { hashWorkingDir } from "@/integrations/checkpoints/CheckpointUtils";
export async function getCwdHash(_controller, request) {
    const pathHash = {};
    for (const path of request.value) {
        try {
            pathHash[path] = hashWorkingDir(path);
        }
        catch {
            pathHash[path] = "";
        }
    }
    return PathHashMap.create({ pathHash });
}
//# sourceMappingURL=getCwdHash.js.map