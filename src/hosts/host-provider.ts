/**
 * Minimal stub for HostProvider - Backend only version
 * Replaces the full VS Code extension host provider
 */

import { ExternalCommentReviewController } from "@/hosts/external/ExternalCommentReviewController"
import { FileEditProvider } from "@/integrations/editor/FileEditProvider"
import { StandaloneTerminalManager } from "@/integrations/terminal/standalone/StandaloneTerminalManager"
import { Setting } from "@/shared/proto/host/env"

export interface HostBridgeClientProvider {
  workspaceClient: any
  envClient: any
  windowClient: any
  diffClient: any
}

export interface StreamingCallbacks {
  onMessage: (message: any) => void
  onError: (error: any) => void
  onComplete: () => void
}

export class HostProvider {
  private static instance: HostProvider | null = null

  private static overriddenWorkspacePaths: string[] | null = null

  extensionFsPath: string = process.cwd()
  globalStorageFsPath: string = `${process.cwd()}/.cline-data`

  static initialize(
    _createWebview?: any,
    _createDiff?: any,
    _createComment?: any,
    _createTerminal?: any,
    _hostBridge?: any,
    _logToChannel?: any,
    _getCallbackUrl?: any,
    _getBinary?: any,
    _extensionPath?: string,
    _globalPath?: string,
  ) {
    if (!HostProvider.instance) {
      HostProvider.instance = new HostProvider()
    }
    return HostProvider.instance
  }

  static get(): HostProvider {
    if (!HostProvider.instance) {
      HostProvider.initialize()
    }
    return HostProvider.instance!
  }

  static isInitialized(): boolean {
    return !!HostProvider.instance
  }

  static reset(): void {
    HostProvider.instance = null
  }

  // Minimal host bridge stubs
  static get workspace() {
    return {
      getWorkspacePaths: async (_request?: any) => ({
        paths: HostProvider.overriddenWorkspacePaths ?? [process.cwd()],
      }),
      openClineSidebarPanel: async (_request?: any) => ({}),
      saveOpenDocumentIfDirty: async (_request?: any) => ({}),
      getDiagnostics: async (_request?: any) => ({ diagnostics: [] }),
      openProblemsPanel: async (_request?: any) => ({}),
      openInFileExplorerPanel: async (_request?: any) => ({}),
      openTerminalPanel: async (_request?: any) => ({}),
      executeCommandInTerminal: async (_request?: any) => ({ success: true }),
      openFolder: async (_request?: any) => ({ success: true }),
    }
  }

  static overrideWorkspacePaths(paths: string[] | null): void {
    HostProvider.overriddenWorkspacePaths = paths
  }

  static get env(): any {
    return {
      debugLog: ({ value }: { value: string }) => console.log(value),
      getHostVersion: async (_request?: any) => ({ version: "1.0.0", platform: "node", clineType: "cli", clineVersion: "unknown" }),
      clipboardWriteText: async (_request?: any) => ({}),
      clipboardReadText: async (_request?: any) => ({ value: '' }),
      getIdeRedirectUri: async (_request?: any) => ({ value: 'http://localhost:3000' }),
      getTelemetrySettings: async (_request?: any) => ({ isEnabled: Setting.DISABLED, errorLevel: "off" }),
      subscribeToTelemetrySettings: async (_request?: any, callbacks?: any) => {
        try {
          callbacks?.onResponse?.({ isEnabled: Setting.DISABLED, errorLevel: "off" })
          callbacks?.onMessage?.({ isEnabled: Setting.DISABLED, errorLevel: "off" })
        } finally {
          callbacks?.onComplete?.()
        }
      },
      shutdown: async (_request?: any) => ({}),
      openExternal: async (_request?: any) => ({}),
    }
  }

  static get window() {
    return {
      showMessage: async ({ type, message }: { type: number; message: string; options?: any }) => {
        console.log(`[${type}] ${message}`)
        return { selectedOption: undefined as string | undefined }
      },
      openFile: async (_request?: any) => ({}),
      showTextDocument: async (_request?: any) => ({}),
      showOpenDialogue: async (_request?: any) => ({ selectedPaths: [] }),
      showInputBox: async (_request?: any) => ({ value: '' }),
      showSaveDialog: async (_request?: any) => ({ path: '' }),
      openSettings: async (_request?: any) => ({}),
      getOpenTabs: async (_request?: any) => ({ paths: [] }),
      getVisibleTabs: async (_request?: any) => ({ paths: [] }),
      getActiveEditor: async (_request?: any) => ({ editor: undefined, filePath: undefined }),
    }
  }

  static get diff() {
    return {
      showDiff: async () => {},
      openDiff: async (_request?: any) => ({ diffId: "1" }),
      replaceText: async (_request?: any) => ({}),
      truncateDocument: async (_request?: any) => ({}),
      saveDocument: async (_request?: any) => ({}),
      scrollDiff: async (_request?: any) => ({}),
      getDocumentText: async (_request?: any) => ({ content: "" }),
      closeAllDiffs: async (_request?: any) => ({}),
      openMultiFileDiff: async (_request?: any) => ({}),
    }
  }

  logToChannel = (message: string) => console.log(message)
  getCallbackUrl = async (path: string) => `http://localhost:3000${path}`
  getBinaryLocation = async (name: string) => name

  // Factory methods for creating providers
  createCommentReviewController() {
    return new ExternalCommentReviewController()
  }

  createTerminalManager() {
    return new StandaloneTerminalManager()
  }

  createDiffViewProvider() {
    return new FileEditProvider()
  }
}

export type WebviewProviderCreator = () => any
export type DiffViewProviderCreator = () => any
export type CommentReviewControllerCreator = () => any
export type TerminalManagerCreator = () => any
export type LogToChannel = (message: string) => void
