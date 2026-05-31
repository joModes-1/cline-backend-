/**
 * VSCode context stub for CLI mode
 * Provides mock implementations of VSCode extension context.
 */
import { fileURLToPath } from "node:url";
import os from "os";
import path from "path";
import { ExtensionRegistryInfo } from "@/registry";
import { createStorageContext } from "@/shared/storage/storage-context";
import { EnvironmentVariableCollection, ExtensionKind, ExtensionMode, readJson, URI } from "./vscode-shim";
// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * CLI-specific state overrides.
 * These values are always returned regardless of what's stored,
 * and writes to these keys are silently ignored.
 */
const CLI_STATE_OVERRIDES = {
    // CLI always uses background execution, not VSCode terminal
    vscodeTerminalExecutionMode: "backgroundExec",
    backgroundEditEnabled: true,
    multiRootEnabled: false,
    enableCheckpointsSetting: false,
    browserSettings: {
        disableToolUse: true,
    },
};
/**
 * Memento adapter that wraps a ClineFileStorage with optional key overrides.
 * Used for globalState where CLI needs to inject hardcoded overrides.
 */
class MementoAdapter {
    store;
    overrides;
    constructor(store, overrides = {}) {
        this.store = store;
        this.overrides = overrides;
    }
    get(key, defaultValue) {
        if (key in this.overrides) {
            return this.overrides[key];
        }
        const value = this.store.get(key);
        return value !== undefined ? value : defaultValue;
    }
    update(key, value) {
        return this.setBatch({ [key]: value });
    }
    keys() {
        return this.store.keys();
    }
    setBatch(entries) {
        // Filter out overridden keys and delegate to underlying store
        const filteredEntries = {};
        for (const [key, value] of Object.entries(entries)) {
            if (!(key in this.overrides)) {
                filteredEntries[key] = value;
            }
        }
        this.store.setBatch(filteredEntries);
        return Promise.resolve();
    }
    setKeysForSync(_keys) {
        // No-op for CLI
    }
}
/**
 * Initialize the VSCode-like context for CLI mode.
 *
 * Creates a shared StorageContext (the single source of truth for all storage)
 * and wraps it in a ClineExtensionContext shell for legacy APIs that still
 * expect the VSCode ExtensionContext shape.
 */
export function initializeCliContext(config = {}) {
    const CLINE_DIR = config.clineDir || process.env.CLINE_DIR || path.join(os.homedir(), ".cline");
    // Create the shared StorageContext — this owns all ClineFileStorage instances.
    // CLI, JetBrains, and VSCode all share this same file-backed implementation.
    let storageContext = createStorageContext({
        clineDir: CLINE_DIR,
        workspacePath: config.workspaceDir || process.cwd(),
        workspaceStorageDir: process.env.WORKSPACE_STORAGE_DIR || undefined,
    });
    storageContext = {
        ...storageContext,
        // Storage — delegates to storageContext stores (with CLI overrides for globalState)
        globalState: new MementoAdapter(storageContext.globalState, CLI_STATE_OVERRIDES),
    };
    const DATA_DIR = storageContext.dataDir;
    const WORKSPACE_STORAGE_DIR = storageContext.workspaceStoragePath;
    // For CLI, extension dir is the package root (one level up from dist/)
    const EXTENSION_DIR = path.resolve(__dirname, "..");
    const EXTENSION_MODE = process.env.IS_DEV === "true" ? ExtensionMode.Development : ExtensionMode.Production;
    const extension = {
        id: ExtensionRegistryInfo.id,
        isActive: true,
        extensionPath: EXTENSION_DIR,
        extensionUri: URI.file(EXTENSION_DIR),
        packageJSON: readJson(path.join(EXTENSION_DIR, "package.json")),
        exports: undefined,
        activate: async () => { },
        extensionKind: ExtensionKind.UI,
    };
    // Build the ClineExtensionContext shell. All storage delegates to storageContext —
    // there are NO separate ClineFileStorage instances here.
    const extensionContext = {
        extension: extension,
        extensionMode: EXTENSION_MODE,
        // URIs / paths
        storageUri: URI.file(WORKSPACE_STORAGE_DIR),
        storagePath: WORKSPACE_STORAGE_DIR,
        globalStorageUri: URI.file(DATA_DIR),
        globalStoragePath: DATA_DIR,
        logUri: URI.file(DATA_DIR),
        logPath: DATA_DIR,
        extensionUri: URI.file(EXTENSION_DIR),
        extensionPath: EXTENSION_DIR,
        asAbsolutePath: (relPath) => path.join(EXTENSION_DIR, relPath),
        subscriptions: [],
        environmentVariableCollection: new EnvironmentVariableCollection(),
    };
    return {
        extensionContext,
        storageContext,
        DATA_DIR,
        EXTENSION_DIR,
        WORKSPACE_STORAGE_DIR,
    };
}
//# sourceMappingURL=vscode-context.js.map