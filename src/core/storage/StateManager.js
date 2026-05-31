import { ApiHandlerSettingsKeys, isSecretKey, isSettingsKey, SecretKeys, } from "@shared/storage/state-keys";
import chokidar from "chokidar";
// import { initializeDistinctId } from "@/services/logging/distinctId"
import { Logger } from "@/shared/services/Logger";
import { AgentConfigLoader } from "../task/tools/subagent/AgentConfigLoader";
import { getTaskHistoryStateFilePath, readTaskHistoryFromState, readTaskSettingsFromStorage, writeTaskHistoryToState, writeTaskSettingsToStorage, } from "./disk";
import { STATE_MANAGER_NOT_INITIALIZED } from "./error-messages";
import { filterAllowedRemoteConfigFields } from "./remote-config/utils";
import { readGlobalStateFromStorage, readSecretsFromStorage, readWorkspaceStateFromStorage } from "./utils/state-helpers";
/**
 * In-memory state manager for fast state access.
 * Provides immediate reads/writes with async disk persistence.
 *
 * All persistent storage is backed by file-based stores via StorageContext.
 * This is shared across all platforms (VSCode, CLI, JetBrains).
 *
 * MULTI-INSTANCE BEHAVIOR:
 * StateManager reads from disk ONLY during initialize(). After that, all reads come from
 * the in-memory cache. Writes update both the cache and disk, but other running instances
 * won't see those changes because they don't re-read from disk.
 *
 * This means: If you have multiple VS Code windows open, each has its own StateManager
 * instance with its own cache. Changing a setting (like plan/act mode) in Window A writes
 * to disk, but Window B keeps using its cached value. Window B only sees the change after
 * restart (when it re-initializes from disk).
 *
 * This is intentional for performance (avoids constant disk reads) and provides natural
 * isolation between concurrent instances. Task-specific state is independent anyway since
 * each window typically runs different tasks.
 */
export class StateManager {
    static instance = null;
    globalStateCache = {};
    taskStateCache = {};
    sessionOverrideCache = {};
    remoteConfigCache = {};
    secretsCache = {};
    workspaceStateCache = {};
    /**
     * File-backed storage context. All reads/writes to persistent state go through here.
     * Do NOT access VSCode's ExtensionContext for storage — use this instead.
     */
    storage;
    isInitialized = false;
    // Cache TTL: 1 hour - long enough to prevent duplicate fetches, short enough to see new models
    MODEL_CACHE_TTL_MS = 60 * 60 * 1000;
    // In-memory model info cache (not persisted to disk)
    // These are for dynamic providers that fetch models from APIs
    modelInfoCache = {
        clineModels: null,
        openRouterModels: null,
        groqModels: null,
        basetenModels: null,
        huggingFaceModels: null,
        requestyModels: null,
        huaweiCloudMaasModels: null,
        hicapModels: null,
        aihubmixModels: null,
        liteLlmModels: null,
        vercelModels: null,
    };
    // Debounced persistence state
    pendingGlobalState = new Set();
    pendingTaskState = new Map();
    pendingSecrets = new Set();
    pendingWorkspaceState = new Set();
    persistenceTimeout = null;
    PERSISTENCE_DELAY_MS = 500;
    taskHistoryWatcher = null;
    // Callback for persistence errors
    onPersistenceError;
    // Callback to sync external state changes with the UI client
    onSyncExternalChange;
    constructor(storage) {
        this.storage = storage;
    }
    /**
     * Initialize the cache by loading data from the file-backed StorageContext.
     */
    static async initialize(storage) {
        if (!StateManager.instance) {
            StateManager.instance = new StateManager(storage);
        }
        if (StateManager.instance.isInitialized) {
            throw new Error("StateManager has already been initialized.");
        }
        try {
            // Skip distinct ID initialization for villa server mode
            // await initializeDistinctId(storage)
            // Load all extension state from file-backed stores
            const globalState = await readGlobalStateFromStorage(storage.globalState);
            const secrets = readSecretsFromStorage(storage.secrets);
            const workspaceState = readWorkspaceStateFromStorage(storage.workspaceState);
            // Populate the cache with all extension state and secrets fields
            // Use populate method to avoid triggering persistence during initialization
            StateManager.instance.populateCache(globalState, secrets, workspaceState);
            // Start watcher for taskHistory.json so external edits update cache (no persist loop)
            await StateManager.instance.setupTaskHistoryWatcher();
            StateManager.instance.isInitialized = true;
            await AgentConfigLoader.getInstance().ready();
        }
        catch (error) {
            Logger.error("[StateManager] Failed to initialize:", error);
            throw error;
        }
        return StateManager.instance;
    }
    static get() {
        if (!StateManager.instance) {
            throw new Error("StateManager has not been initialized");
        }
        return StateManager.instance;
    }
    /**
     * Register callbacks for state manager events
     */
    registerCallbacks(callbacks) {
        if (callbacks.onPersistenceError) {
            this.onPersistenceError = callbacks.onPersistenceError;
        }
        if (callbacks.onSyncExternalChange) {
            this.onSyncExternalChange = callbacks.onSyncExternalChange;
        }
    }
    /**
     * Set method for global state keys - updates cache immediately and schedules debounced persistence
     */
    setGlobalState(key, value) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache immediately for instant access
        this.globalStateCache[key] = value;
        // Add to pending persistence set and schedule debounced write
        this.pendingGlobalState.add(key);
        this.scheduleDebouncedPersistence();
    }
    /**
     * Batch set method for global state keys - updates cache immediately and schedules debounced persistence
     */
    setGlobalStateBatch(updates) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache in one go
        // Using object.assign to because typescript is not able to infer the type of the updates object when using Object.entries
        Object.assign(this.globalStateCache, updates);
        // Then track the keys for persistence
        Object.keys(updates).forEach((key) => {
            this.pendingGlobalState.add(key);
        });
        // Schedule debounced persistence
        this.scheduleDebouncedPersistence();
    }
    setRemoteConfigState(updates) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache in one go
        this.remoteConfigCache = {
            ...this.remoteConfigCache,
            ...filterAllowedRemoteConfigFields(updates),
        };
    }
    /**
     * Set method for task settings keys - updates cache immediately and schedules debounced persistence
     */
    setTaskSettings(taskId, key, value) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache immediately for instant access
        this.taskStateCache[key] = value;
        // Add to pending persistence set and schedule debounced write
        if (!this.pendingTaskState.has(taskId)) {
            this.pendingTaskState.set(taskId, new Set());
        }
        this.pendingTaskState.get(taskId).add(key);
        this.scheduleDebouncedPersistence();
    }
    /**
     * Batch set method for task settings keys - updates cache immediately and schedules debounced persistence
     */
    setTaskSettingsBatch(taskId, updates) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache in one go
        Object.assign(this.taskStateCache, updates);
        // Then track the keys for persistence
        if (!this.pendingTaskState.has(taskId)) {
            this.pendingTaskState.set(taskId, new Set());
        }
        Object.keys(updates).forEach((key) => {
            this.pendingTaskState.get(taskId).add(key);
        });
        // Schedule debounced persistence
        this.scheduleDebouncedPersistence();
    }
    /**
     * Load task settings from disk into cache
     */
    async loadTaskSettings(taskId) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        try {
            const taskSettings = await readTaskSettingsFromStorage(taskId);
            // Populate task cache with loaded settings
            Object.assign(this.taskStateCache, taskSettings);
        }
        catch (error) {
            // If reading fails, just use empty cache
            Logger.error("[StateManager] Failed to load task settings, defaulting to globally selected settings.", error);
        }
    }
    /**
     * Clear task settings cache - ensures pending changes are persisted first
     */
    async clearTaskSettings() {
        // If there are pending task settings, persist them first
        if (this.pendingTaskState.size > 0) {
            try {
                // Persist pending task state immediately
                await this.persistTaskStateBatch(this.pendingTaskState);
                // Clear pending set after successful persistence
                this.pendingTaskState.clear();
            }
            catch (error) {
                Logger.error("[StateManager] Failed to persist task settings before clearing:", error);
            }
        }
        this.taskStateCache = {};
        this.pendingTaskState.clear();
    }
    /**
     * Set method for secret keys - updates cache immediately and schedules debounced persistence
     */
    setSecret(key, value) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache immediately for instant access
        this.secretsCache[key] = value;
        // Add to pending persistence set and schedule debounced write
        this.pendingSecrets.add(key);
        this.scheduleDebouncedPersistence();
    }
    /**
     * Batch set method for secret keys - updates cache immediately and schedules debounced persistence
     */
    setSecretsBatch(updates) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache immediately for all keys
        Object.entries(updates).forEach(([key, value]) => {
            // Skip unchanged values as we don't want to trigger unnecessary
            // writes & incorrectly fire an onDidChange events.
            const current = this.secretsCache[key];
            if (current === value) {
                return;
            }
            this.secretsCache[key] = value;
            this.pendingSecrets.add(key);
        });
        // Schedule debounced persistence
        this.scheduleDebouncedPersistence();
    }
    /**
     * Set method for workspace state keys - updates cache immediately and schedules debounced persistence
     */
    setWorkspaceState(key, value) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache immediately for instant access
        this.workspaceStateCache[key] = value;
        // Add to pending persistence set and schedule debounced write
        this.pendingWorkspaceState.add(key);
        this.scheduleDebouncedPersistence();
    }
    /**
     * Batch set method for workspace state keys - updates cache immediately and schedules debounced persistence
     */
    setWorkspaceStateBatch(updates) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache immediately for all keys
        Object.entries(updates).forEach(([key, value]) => {
            this.workspaceStateCache[key] = value;
            this.pendingWorkspaceState.add(key);
        });
        // Schedule debounced persistence
        this.scheduleDebouncedPersistence();
    }
    /**
     * Set a session-scoped override for a settings key.
     * Session overrides are in-memory only and are NEVER persisted to disk.
     * They take precedence after remote config but before task-specific and global settings.
     *
     * Use this for CLI flags like --yolo that should apply for the current
     * process lifetime only, without modifying the user's saved settings.
     */
    setSessionOverride(key, value) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        this.sessionOverrideCache[key] = value;
    }
    /**
     * Set method for remote config field - updates cache immediately (no persistence)
     * Remote config is read-only from the extension's perspective and only stored in memory
     */
    setRemoteConfigField(key, value) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Update cache immediately for instant access (no persistence needed)
        this.remoteConfigCache[key] = value;
    }
    /**
     * Get method for remote config settings - returns cache immediately (no persistence)
     * Remote config is read-only from the extension's perspective and only stored in memory
     */
    getRemoteConfigSettings() {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        return this.remoteConfigCache;
    }
    /**
     * Clear remote config cache
     * Used when switching organizations or when remote config is no longer applicable
     */
    clearRemoteConfig() {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        this.remoteConfigCache = {};
    }
    /**
     * Set models cache for a specific provider (in-memory only, not persisted)
     */
    setModelsCache(provider, models) {
        const cacheKey = `${provider}Models`;
        this.modelInfoCache[cacheKey] = { data: models, timestamp: Date.now() };
    }
    getModelsCache(provider) {
        const cacheKey = `${provider}Models`;
        const cached = this.modelInfoCache[cacheKey];
        if (!cached) {
            return null;
        }
        // Check if cache has expired
        if (Date.now() - cached.timestamp > this.MODEL_CACHE_TTL_MS) {
            this.modelInfoCache[cacheKey] = null;
            return null;
        }
        return cached.data;
    }
    /**
     * Get model info by provider and model ID (from in-memory cache)
     */
    getModelInfo(provider, modelId) {
        const cacheKey = `${provider}Models`;
        const cached = this.modelInfoCache[cacheKey];
        if (!cached) {
            return undefined;
        }
        // Check if cache has expired
        if (Date.now() - cached.timestamp > this.MODEL_CACHE_TTL_MS) {
            this.modelInfoCache[cacheKey] = null;
            return undefined;
        }
        return cached.data[modelId];
    }
    /**
     * Initialize chokidar watcher for the taskHistory.json file
     * Updates in-memory cache on external changes without writing back to disk.
     */
    async setupTaskHistoryWatcher() {
        try {
            const historyFile = await getTaskHistoryStateFilePath();
            // Close any existing watcher before creating a new one
            if (this.taskHistoryWatcher) {
                await this.taskHistoryWatcher.close();
                this.taskHistoryWatcher = null;
            }
            this.taskHistoryWatcher = chokidar.watch(historyFile, {
                persistent: true,
                ignoreInitial: true,
                atomic: true,
                awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
            });
            const syncTaskHistoryFromDisk = async () => {
                try {
                    if (!this.isInitialized) {
                        return;
                    }
                    const onDisk = await readTaskHistoryFromState();
                    const cached = this.globalStateCache["taskHistory"];
                    if (JSON.stringify(onDisk) !== JSON.stringify(cached)) {
                        this.globalStateCache["taskHistory"] = onDisk;
                        await this.onSyncExternalChange?.();
                    }
                }
                catch (err) {
                    Logger.error("[StateManager] Failed to reload task history on change:", err);
                }
            };
            this.taskHistoryWatcher
                .on("add", () => syncTaskHistoryFromDisk())
                .on("change", () => syncTaskHistoryFromDisk())
                .on("unlink", async () => {
                this.globalStateCache["taskHistory"] = [];
                await this.onSyncExternalChange?.();
            })
                .on("error", (error) => Logger.error("[StateManager] TaskHistory watcher error:", error));
        }
        catch (err) {
            Logger.error("[StateManager] Failed to set up taskHistory watcher:", err);
        }
    }
    /**
     * Convenience method for getting API configuration
     * Ensures cache is initialized if not already done
     */
    getApiConfiguration() {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Construct API configuration from cached component keys
        return this.constructApiConfigurationFromCache();
    }
    /**
     * Convenience method for setting API configuration
     * Automatically categorizes keys based on STATE_DEFINITION and SecretKeys
     */
    setApiConfiguration(apiConfiguration) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        // Automatically categorize the API configuration keys
        const { settingsUpdates, secretsUpdates } = Object.entries(apiConfiguration).reduce((acc, [key, value]) => {
            if (key === undefined || value === undefined) {
                return acc; // Skip undefined values
            }
            if (isSecretKey(key)) {
                // This is a secret key
                acc.secretsUpdates[key] = value;
            }
            else if (isSettingsKey(key)) {
                // This is a settings key
                acc.settingsUpdates[key] = value;
            }
            return acc;
        }, { settingsUpdates: {}, secretsUpdates: {} });
        // Batch update settings (stored in global state)
        if (Object.keys(settingsUpdates).length > 0) {
            this.setRemoteConfigState(settingsUpdates);
            this.setGlobalStateBatch(settingsUpdates);
        }
        // Batch update secrets
        if (Object.keys(secretsUpdates).length > 0) {
            this.setSecretsBatch(secretsUpdates);
        }
    }
    /**
     * Get method for global settings keys - reads from in-memory cache
     * Precedence: remote config > session override > task settings > global settings
     */
    getGlobalSettingsKey(key) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        if (this.remoteConfigCache[key] !== undefined) {
            return this.remoteConfigCache[key];
        }
        if (this.sessionOverrideCache[key] !== undefined) {
            return this.sessionOverrideCache[key];
        }
        if (this.taskStateCache[key] !== undefined) {
            return this.taskStateCache[key];
        }
        return this.globalStateCache[key];
    }
    /**
     * Get method for global state keys - reads from in-memory cache
     */
    getGlobalStateKey(key) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        if (this.remoteConfigCache[key] !== undefined) {
            return this.remoteConfigCache[key];
        }
        return this.globalStateCache[key];
    }
    /**
     * Get method for secret keys - reads from in-memory cache
     */
    getSecretKey(key) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        return this.secretsCache[key];
    }
    /**
     * Get method for workspace state keys - reads from in-memory cache
     */
    getWorkspaceStateKey(key) {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        return this.workspaceStateCache[key];
    }
    /**
     * Reinitialize the state manager by clearing all state and reloading from disk
     * Used for error recovery when write operations fail
     */
    async reInitialize(currentTaskId) {
        if (this.persistenceTimeout) {
            await this.persistPendingState();
        }
        // Clear all cached data and pending state
        this.dispose();
        // Reinitialize from the same storage context
        await StateManager.initialize(this.storage);
        // If there's an active task, reload its settings
        if (currentTaskId) {
            await this.loadTaskSettings(currentTaskId);
        }
    }
    /**
     * Dispose of the state manager
     */
    dispose() {
        if (this.persistenceTimeout) {
            clearTimeout(this.persistenceTimeout);
            this.persistenceTimeout = null;
        }
        // Close file watcher if active
        if (this.taskHistoryWatcher) {
            this.taskHistoryWatcher.close();
            this.taskHistoryWatcher = null;
        }
        this.pendingGlobalState.clear();
        this.pendingSecrets.clear();
        this.pendingWorkspaceState.clear();
        this.pendingTaskState.clear();
        this.globalStateCache = {};
        this.secretsCache = {};
        this.workspaceStateCache = {};
        this.taskStateCache = {};
        this.remoteConfigCache = {};
        this.sessionOverrideCache = {};
        this.isInitialized = false;
    }
    /**
     * Private method to persist all pending state changes
     * Returns early if nothing is pending
     */
    async persistPendingState() {
        // Early return if nothing to persist
        if (this.pendingGlobalState.size === 0 &&
            this.pendingSecrets.size === 0 &&
            this.pendingWorkspaceState.size === 0 &&
            this.pendingTaskState.size === 0) {
            return;
        }
        // Execute all persistence operations in parallel
        await Promise.all([
            this.persistGlobalStateBatch(this.pendingGlobalState),
            this.persistSecretsBatch(this.pendingSecrets),
            this.persistWorkspaceStateBatch(this.pendingWorkspaceState),
            this.persistTaskStateBatch(this.pendingTaskState),
        ]);
        // Clear pending sets after successful persistence
        this.pendingGlobalState.clear();
        this.pendingSecrets.clear();
        this.pendingWorkspaceState.clear();
        this.pendingTaskState.clear();
    }
    /**
     * Flush all pending state changes immediately to disk
     * Bypasses the debounced persistence and forces immediate writes
     */
    async flushPendingState() {
        // Cancel any pending timeout
        if (this.persistenceTimeout) {
            clearTimeout(this.persistenceTimeout);
            this.persistenceTimeout = null;
        }
        // Execute persistence immediately
        await this.persistPendingState();
    }
    /**
     * Schedule debounced persistence - simple timeout-based persistence
     */
    scheduleDebouncedPersistence() {
        // Clear existing timeout if one is pending
        if (this.persistenceTimeout) {
            clearTimeout(this.persistenceTimeout);
        }
        // Schedule a new timeout to persist pending changes
        this.persistenceTimeout = setTimeout(async () => {
            try {
                await this.persistPendingState();
                this.persistenceTimeout = null;
            }
            catch (error) {
                Logger.error("[StateManager] Failed to persist pending changes:", error);
                this.persistenceTimeout = null;
                // Call persistence error callback for error recovery
                this.onPersistenceError?.({ error: error });
            }
        }, this.PERSISTENCE_DELAY_MS);
    }
    /**
     * Persist global state keys to the file-backed store.
     * Uses setBatch for efficiency (single disk write).
     */
    async persistGlobalStateBatch(keys) {
        // Separate taskHistory (goes to its own file) from regular global state
        const regularEntries = {};
        for (const key of keys) {
            if (key === "taskHistory") {
                // Route task history persistence to its own file
                await writeTaskHistoryToState(this.globalStateCache[key]);
            }
            else {
                regularEntries[key] = this.globalStateCache[key];
            }
        }
        // Batch write all regular keys in a single disk operation
        if (Object.keys(regularEntries).length > 0) {
            this.storage.globalStateBackingStore.setBatch(regularEntries);
        }
    }
    /**
     * Private method to batch persist task state keys with a single write operation
     */
    async persistTaskStateBatch(pendingTaskStates) {
        if (pendingTaskStates.size === 0) {
            return;
        }
        // Persist each task's settings
        await Promise.all(Array.from(pendingTaskStates.entries()).map(([taskId, keys]) => {
            if (keys.size === 0) {
                return Promise.resolve();
            }
            const settingsToWrite = {};
            for (const key of keys) {
                const value = this.taskStateCache[key];
                if (value !== undefined) {
                    settingsToWrite[key] = value;
                }
            }
            return writeTaskSettingsToStorage(taskId, settingsToWrite);
        }));
    }
    /**
     * Persist secrets to the file-backed store.
     * Uses setBatch for efficiency (single disk write).
     */
    async persistSecretsBatch(keys) {
        const entries = {};
        for (const key of keys) {
            const value = this.secretsCache[key];
            entries[key] = value || undefined; // Convert empty strings to undefined (delete)
        }
        this.storage.secrets.setBatch(entries);
    }
    /**
     * Persist workspace state to the file-backed store.
     * Uses setBatch for efficiency (single disk write).
     */
    async persistWorkspaceStateBatch(keys) {
        const entries = {};
        for (const key of keys) {
            entries[key] = this.workspaceStateCache[key];
        }
        this.storage.workspaceState.setBatch(entries);
    }
    /**
     * Private method to populate cache with all extension state without triggering persistence
     * Used during initialization
     */
    populateCache(globalState, secrets, workspaceState) {
        Object.assign(this.globalStateCache, globalState);
        Object.assign(this.secretsCache, secrets);
        Object.assign(this.workspaceStateCache, workspaceState);
    }
    /**
     * Helper to get a setting value with override support
     * Precedence: remote config > session override > task settings > global settings
     */
    getSettingWithOverride(key) {
        const remoteValue = this.remoteConfigCache[key];
        if (remoteValue !== undefined) {
            return remoteValue;
        }
        if (this.sessionOverrideCache[key] !== undefined) {
            return this.sessionOverrideCache[key];
        }
        const taskValue = this.taskStateCache[key];
        if (taskValue !== undefined) {
            return taskValue;
        }
        return this.globalStateCache[key];
    }
    /**
     * Helper to get a secret value
     */
    getSecret(key) {
        return this.secretsCache[key];
    }
    /**
     * Construct API configuration from cached component keys
     */
    constructApiConfigurationFromCache() {
        // Build secrets object
        const secrets = Object.fromEntries(SecretKeys.map((key) => [key, this.getSecret(key)]));
        // Preserve legacy fallback behavior for LiteLLM API key:
        // if a remoteLiteLlmApiKey is set (via remote config), it should
        // take precedence over the local liteLlmApiKey.
        const remoteLiteLlmApiKey = this.secretsCache["remoteLiteLlmApiKey"];
        if (remoteLiteLlmApiKey !== undefined && remoteLiteLlmApiKey !== null && remoteLiteLlmApiKey !== "") {
            secrets.liteLlmApiKey = remoteLiteLlmApiKey;
        }
        // Build API handler settings object with task override support
        const settings = Object.fromEntries(ApiHandlerSettingsKeys.map((key) => [key, this.getSettingWithOverride(key)]));
        return {
            ...secrets,
            ...settings,
        };
    }
    /**
     * Get all global state entries (for debugging/inspection)
     */
    getAllGlobalStateEntries() {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        return { ...this.globalStateCache };
    }
    /**
     * Get all workspace state entries (for debugging/inspection)
     */
    getAllWorkspaceStateEntries() {
        if (!this.isInitialized) {
            throw new Error(STATE_MANAGER_NOT_INITIALIZED);
        }
        return { ...this.workspaceStateCache };
    }
}
//# sourceMappingURL=StateManager.js.map