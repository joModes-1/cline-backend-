import { Empty } from "@shared/proto/cline/common";
/**
 * Report bug slash command logic
 */
export async function reportBug(controller, _request) {
    await controller.task?.handleWebviewAskResponse("yesButtonClicked");
    return Empty.create();
}
//# sourceMappingURL=reportBug.js.map