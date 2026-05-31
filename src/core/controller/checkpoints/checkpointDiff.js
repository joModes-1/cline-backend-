import { Empty } from "@shared/proto/cline/common";
export async function checkpointDiff(controller, request) {
    if (request.value) {
        await controller.task?.checkpointManager?.presentMultifileDiff?.(request.value, false);
    }
    return Empty.create();
}
//# sourceMappingURL=checkpointDiff.js.map