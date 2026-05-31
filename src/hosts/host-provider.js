/**
 * Minimal stub for HostProvider - Backend only version
 * Replaces the full VS Code extension host provider
 */
import { ExternalCommentReviewController } from "@/hosts/external/ExternalCommentReviewController";
import { FileEditProvider } from "@/integrations/editor/FileEditProvider";
import { StandaloneTerminalManager } from "@/integrations/terminal/standalone/StandaloneTerminalManager";
import { Setting } from "@/shared/proto/host/env";
export class HostProvider {
    static instance = null;
    static overriddenWorkspacePaths = null;
    extensionFsPath = process.cwd();
    globalStorageFsPath = `${process.cwd()}/.cline-data`;
    static initialize(_createWebview, _createDiff, _createComment, _createTerminal, _hostBridge, _logToChannel, _getCallbackUrl, _getBinary, _extensionPath, _globalPath) {
        if (!HostProvider.instance) {
            HostProvider.instance = new HostProvider();
        }
        return HostProvider.instance;
    }
    static get() {
        if (!HostProvider.instance) {
            HostProvider.initialize();
        }
        return HostProvider.instance;
    }
    static isInitialized() {
        return !!HostProvider.instance;
    }
    static reset() {
        HostProvider.instance = null;
    }
    // Minimal host bridge stubs
    static get workspace() {
        return {
            getWorkspacePaths: async (_request) => ({
                paths: HostProvider.overriddenWorkspacePaths ?? [process.cwd()],
            }),
            openClineSidebarPanel: async (_request) => ({}),
            saveOpenDocumentIfDirty: async (_request) => ({}),
            getDiagnostics: async (_request) => ({ diagnostics: [] }),
            openProblemsPanel: async (_request) => ({}),
            openInFileExplorerPanel: async (_request) => ({}),
            openTerminalPanel: async (_request) => ({}),
            executeCommandInTerminal: async (_request) => ({ success: true }),
            openFolder: async (_request) => ({ success: true }),
        };
    }
    static overrideWorkspacePaths(paths) {
        HostProvider.overriddenWorkspacePaths = paths;
    }
    static get env() {
        return {
            debugLog: ({ value }) => console.log(value),
            getHostVersion: async (_request) => ({ version: "1.0.0", platform: "node", clineType: "cli", clineVersion: "unknown" }),
            clipboardWriteText: async (_request) => ({}),
            clipboardReadText: async (_request) => ({ value: '' }),
            getIdeRedirectUri: async (_request) => ({ value: 'http://localhost:3000' }),
            getTelemetrySettings: async (_request) => ({ isEnabled: Setting.DISABLED, errorLevel: "off" }),
            subscribeToTelemetrySettings: async (_request, callbacks) => {
                try {
                    callbacks?.onResponse?.({ isEnabled: Setting.DISABLED, errorLevel: "off" });
                    callbacks?.onMessage?.({ isEnabled: Setting.DISABLED, errorLevel: "off" });
                }
                finally {
                    callbacks?.onComplete?.();
                }
            },
            shutdown: async (_request) => ({}),
            openExternal: async (_request) => ({}),
        };
    }
    static get window() {
        return {
            showMessage: async ({ type, message }) => {
                console.log(`[${type}] ${message}`);
                return { selectedOption: undefined };
            },
            openFile: async (_request) => ({}),
            showTextDocument: async (_request) => ({}),
            showOpenDialogue: async (_request) => ({ selectedPaths: [] }),
            showInputBox: async (_request) => ({ value: '' }),
            showSaveDialog: async (_request) => ({ path: '' }),
            openSettings: async (_request) => ({}),
            getOpenTabs: async (_request) => ({ paths: [] }),
            getVisibleTabs: async (_request) => ({ paths: [] }),
            getActiveEditor: async (_request) => ({ editor: undefined, filePath: undefined }),
        };
    }
    static get diff() {
        return {
            showDiff: async () => { },
            openDiff: async (_request) => ({ diffId: "1" }),
            replaceText: async (_request) => ({}),
            truncateDocument: async (_request) => ({}),
            saveDocument: async (_request) => ({}),
            scrollDiff: async (_request) => ({}),
            getDocumentText: async (_request) => ({ content: "" }),
            closeAllDiffs: async (_request) => ({}),
            openMultiFileDiff: async (_request) => ({}),
        };
    }
    logToChannel = (message) => console.log(message);
    getCallbackUrl = async (path) => `http://localhost:3000${path}`;
    getBinaryLocation = async (name) => name;
    // Factory methods for creating providers
    createCommentReviewController() {
        return new ExternalCommentReviewController();
    }
    createTerminalManager() {
        return new StandaloneTerminalManager();
    }
    createDiffViewProvider() {
        return new FileEditProvider();
    }
}
//# sourceMappingURL=host-provider.js.map