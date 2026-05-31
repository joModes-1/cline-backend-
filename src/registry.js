/**
 * Minimal stub for ExtensionRegistryInfo - Backend only version
 */
export const ExtensionRegistryInfo = {
    id: "saoudrizwan.claude-dev",
    name: "claude-dev",
    version: "3.74.0",
    commands: {
        PlusButton: "cline.plusButtonClicked",
        McpButton: "cline.mcpButtonClicked",
        SettingsButton: "cline.settingsButtonClicked",
        HistoryButton: "cline.historyButtonClicked",
        AccountButton: "cline.accountButtonClicked",
        WorktreesButton: "cline.worktreesButtonClicked",
        AddToChat: "cline.addToChat",
        TerminalOutput: "cline.addTerminalOutputToChat",
        FocusChatInput: "cline.focusChatInput",
        FixWithCline: "cline.fixWithCline",
        ExplainCode: "cline.explainCode",
        ImproveCode: "cline.improveCode",
        GenerateCommit: "cline.generateGitCommitMessage",
        AbortCommit: "cline.abortGitCommitMessage",
        JupyterGenerateCell: "cline.jupyterGenerateCell",
        JupyterExplainCell: "cline.jupyterExplainCell",
        JupyterImproveCell: "cline.jupyterImproveCell",
        Walkthrough: "cline.openWalkthrough",
        ReconstructTaskHistory: "cline.reconstructTaskHistory",
    },
    views: {
        Sidebar: "claude-dev.SidebarProvider",
    },
};
export const HostRegistryInfo = {
    _distinctId: "anonymous",
    async init(distinctId) {
        HostRegistryInfo._distinctId = distinctId;
    },
    get() {
        return {
            distinctId: HostRegistryInfo._distinctId,
            ide: "web",
            platform: "web",
            os: process.platform,
            extensionVersion: ExtensionRegistryInfo.version,
        };
    },
};
//# sourceMappingURL=registry.js.map