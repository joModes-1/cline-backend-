import { Empty } from "@shared/proto/cline/common";
export async function cancelBackgroundCommand(controller, _request) {
    const controllerWithCancel = controller;
    await controllerWithCancel.cancelBackgroundCommand();
    return Empty.create();
}
//# sourceMappingURL=cancelBackgroundCommand.js.map