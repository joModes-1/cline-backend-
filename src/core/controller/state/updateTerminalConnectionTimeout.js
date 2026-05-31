export async function updateTerminalConnectionTimeout(controller, request) {
    const timeoutMs = request.timeoutMs;
    // Update the terminal connection timeout setting in the state
    controller.stateManager.setGlobalState("shellIntegrationTimeout", timeoutMs || 4000);
    // Broadcast state update to all webviews
    await controller.postStateToWebview();
    return { timeoutMs };
}
//# sourceMappingURL=updateTerminalConnectionTimeout.js.map