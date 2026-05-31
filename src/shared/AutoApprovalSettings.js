export const DEFAULT_AUTO_APPROVAL_SETTINGS = {
    version: 1,
    enabled: true, // Legacy field - always true by default
    favorites: [], // Legacy field - kept as empty array
    maxRequests: 20, // Legacy field - kept for backward compatibility
    actions: {
        readFiles: true,
        readFilesExternally: false,
        editFiles: false,
        editFilesExternally: false,
        executeSafeCommands: true,
        executeAllCommands: false,
        useBrowser: false,
        useMcp: true,
    },
    enableNotifications: false,
};
//# sourceMappingURL=AutoApprovalSettings.js.map