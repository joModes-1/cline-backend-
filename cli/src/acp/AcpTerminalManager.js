/**
 * ACP Terminal Manager for terminal operations delegation.
 *
 * This manager handles terminal lifecycle operations via the ACP client,
 * allowing the editor to manage terminal processes instead of the agent
 * spawning its own processes.
 *
 * Implements ITerminalManager interface for compatibility with the Task class.
 *
 * @module acp
 */
import { DEFAULT_TERMINAL_OUTPUT_LINE_LIMIT, PROCESS_HOT_TIMEOUT_NORMAL } from "@integrations/terminal/constants";
import { EventEmitter } from "events";
import { Logger } from "@/shared/services/Logger";
// =============================================================================
// ACP Terminal Process - implements ITerminalProcess
// =============================================================================
/**
 * Terminal process implementation for ACP terminals.
 * Wraps ACP terminal operations and emits events compatible with ITerminalProcess.
 */
class AcpTerminalProcess extends EventEmitter {
    isHot = false;
    waitForShellIntegration = false;
    _unretrievedOutput = "";
    _continued = false;
    _completed = false;
    _hotTimeout = null;
    _exitWaitTimeout = null;
    manager;
    terminalId;
    pollInterval = null;
    constructor(manager, terminalId) {
        super();
        this.manager = manager;
        this.terminalId = terminalId;
    }
    continue() {
        this._continued = true;
        this.cleanup();
        this.emit("continue");
    }
    getUnretrievedOutput() {
        const output = this._unretrievedOutput;
        this._unretrievedOutput = "";
        return output;
    }
    async terminate() {
        this.cleanup();
        await this.manager.kill(this.terminalId);
    }
    /**
     * Clean up all timers and intervals.
     * Called on continue, terminate, or completion to prevent memory leaks.
     */
    cleanup() {
        this.stopPolling();
        if (this._hotTimeout) {
            clearTimeout(this._hotTimeout);
            this._hotTimeout = null;
        }
        if (this._exitWaitTimeout) {
            clearTimeout(this._exitWaitTimeout);
            this._exitWaitTimeout = null;
        }
    }
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
    /**
     * Run the command and start polling for output.
     * This method sets up the polling loop that emits 'line' events.
     */
    run(_command) {
        let lastOutput = "";
        // Start polling for output
        this.pollInterval = setInterval(async () => {
            if (this._continued || this._completed) {
                this.stopPolling();
                return;
            }
            try {
                const result = await this.manager.getOutput(this.terminalId);
                if (!result.success) {
                    this.stopPolling();
                    this.emit("error", new Error(result.error || "Failed to get output"));
                    return;
                }
                // Emit new lines
                if (result.output.length > lastOutput.length) {
                    const newOutput = result.output.slice(lastOutput.length);
                    this._unretrievedOutput += newOutput;
                    lastOutput = result.output;
                    // Mark as hot and reset timeout
                    this.setHot();
                    // Emit line events
                    const lines = newOutput.split("\n");
                    for (const line of lines) {
                        if (line) {
                            this.emit("line", line);
                        }
                    }
                }
                // Check if completed
                if (result.exitStatus) {
                    this._completed = true;
                    this.stopPolling();
                    this.emit("completed");
                }
            }
            catch (error) {
                this.stopPolling();
                this.emit("error", error instanceof Error ? error : new Error(String(error)));
            }
        }, 100); // Poll every 100ms
        // Also set up exit waiting in parallel
        this.manager.waitForExit(this.terminalId).then((result) => {
            if (result.success && !this._continued && !this._completed) {
                // The polling loop should handle this, but ensure we emit completed
                // Track the timeout so it can be cleaned up if the process is terminated early
                this._exitWaitTimeout = setTimeout(() => {
                    if (!this._continued && !this._completed) {
                        this._completed = true;
                        this.cleanup();
                        this.emit("completed");
                    }
                }, 200);
            }
        });
    }
    setHot() {
        this.isHot = true;
        if (this._hotTimeout) {
            clearTimeout(this._hotTimeout);
        }
        this._hotTimeout = setTimeout(() => {
            this.isHot = false;
        }, PROCESS_HOT_TIMEOUT_NORMAL);
    }
}
// =============================================================================
// ACP Terminal - implements ITerminal
// =============================================================================
/**
 * Terminal implementation for ACP terminals.
 * Wraps a ManagedTerminal to provide the ITerminal interface.
 */
class AcpTerminal {
    name;
    processId;
    shellIntegration;
    /** Internal reference to the managed terminal */
    _managedTerminal;
    /** Internal reference to the manager */
    _manager;
    /** Current working directory */
    _cwd;
    constructor(managedTerminal, manager) {
        this._managedTerminal = managedTerminal;
        this._manager = manager;
        this._cwd = managedTerminal.cwd || "";
        this.name = `ACP Terminal ${managedTerminal.numericId}`;
        this.processId = Promise.resolve(managedTerminal.numericId);
        // Set up shell integration info
        this.shellIntegration = {
            cwd: { fsPath: this._cwd },
        };
    }
    sendText(_text, _addNewLine) {
        // ACP terminals don't support interactive input this way
        // Commands are run via runCommand
        Logger.debug("[AcpTerminal] sendText not supported for ACP terminals");
    }
    show() {
        // No-op for ACP terminals - the client manages display
    }
    hide() {
        // No-op for ACP terminals - the client manages display
    }
    dispose() {
        // Release the terminal
        this._manager.release(this._managedTerminal.id).catch((err) => {
            Logger.debug("[AcpTerminal] Error releasing terminal:", err);
        });
    }
}
// =============================================================================
// Helper function to merge process with promise
// =============================================================================
/**
 * Helper function to merge a process with a promise for the TerminalProcessResultPromise type.
 * This allows the returned object to be both awaitable and have event methods.
 */
function mergePromise(process, promise) {
    const nativePromisePrototype = (async () => { })().constructor.prototype;
    const descriptors = ["then", "catch", "finally"].map((property) => [
        property,
        Reflect.getOwnPropertyDescriptor(nativePromisePrototype, property),
    ]);
    for (const [property, descriptor] of descriptors) {
        if (descriptor) {
            const value = descriptor.value.bind(promise);
            Reflect.defineProperty(process, property, { ...descriptor, value });
        }
    }
    // Ensure terminate() is accessible on the merged promise
    if (process.terminate && typeof process.terminate === "function") {
        Object.defineProperty(process, "terminate", {
            value: process.terminate.bind(process),
            writable: false,
            enumerable: false,
            configurable: false,
        });
    }
    return process;
}
// =============================================================================
// ACP Terminal Manager - implements ITerminalManager
// =============================================================================
/**
 * Manager for terminal operations via the ACP client.
 *
 * This class provides a high-level interface for creating and managing
 * terminals through the ACP protocol, with automatic tracking of
 * terminal instances.
 *
 * Implements ITerminalManager for compatibility with the Task class.
 */
export class AcpTerminalManager {
    connection;
    clientCapabilities;
    sessionIdResolver;
    /** Active terminals indexed by their string ID */
    terminals = new Map();
    /** Map from numeric ID to string ID for ITerminalManager compatibility */
    numericIdToStringId = new Map();
    /** Next numeric ID to assign */
    nextNumericId = 1;
    /** Active processes indexed by numeric terminal ID */
    processes = new Map();
    /** TerminalInfo wrappers indexed by numeric ID */
    terminalInfos = new Map();
    // Configuration options for ITerminalManager
    terminalReuseEnabled = true;
    terminalOutputLineLimit = DEFAULT_TERMINAL_OUTPUT_LINE_LIMIT;
    /**
     * Creates a new AcpTerminalManager.
     *
     * @param connection - The ACP agent-side connection
     * @param clientCapabilities - The client's advertised capabilities
     * @param sessionIdResolver - The current session ID
     */
    constructor(connection, clientCapabilities, sessionIdResolver) {
        this.connection = connection;
        this.clientCapabilities = clientCapabilities;
        this.sessionIdResolver = sessionIdResolver;
    }
    // =========================================================================
    // ITerminalManager Implementation
    // =========================================================================
    /**
     * Run a command in the specified terminal.
     * @param terminalInfo The terminal to run the command in
     * @param command The command to execute
     * @returns A promise-like object that emits events and resolves on completion
     */
    runCommand(terminalInfo, command) {
        const terminal = terminalInfo.terminal;
        const managedTerminal = terminal._managedTerminal;
        // Update state
        terminalInfo.busy = true;
        terminalInfo.lastCommand = command;
        terminalInfo.lastActive = Date.now();
        managedTerminal.busy = true;
        managedTerminal.lastCommand = command;
        // Create the process - will be updated with actual terminal ID after creation
        const process = new AcpTerminalProcess(this, managedTerminal.id);
        this.processes.set(managedTerminal.numericId, process);
        // Set up completion handlers
        process.once("completed", () => {
            terminalInfo.busy = false;
            managedTerminal.busy = false;
        });
        process.once("error", (_error) => {
            terminalInfo.busy = false;
            managedTerminal.busy = false;
        });
        // Create promise for the process
        const promise = new Promise((resolve, reject) => {
            process.once("continue", () => resolve());
            process.once("completed", () => resolve());
            process.once("error", (error) => reject(error));
        });
        // For ACP, we need to create a new terminal with the command
        // since ACP terminals are command-based, not interactive
        this.runCommandInternal(managedTerminal, command, process);
        return mergePromise(process, promise);
    }
    /**
     * Internal method to run a command via ACP.
     */
    async runCommandInternal(managedTerminal, command, process) {
        try {
            // Create a new ACP terminal with the command
            const request = {
                sessionId: this.getSessionId(),
                command: command,
                cwd: managedTerminal.cwd,
            };
            const handle = await this.connection.createTerminal(request);
            // Remove old terminal entry if it exists
            if (managedTerminal.id && this.terminals.has(managedTerminal.id)) {
                this.terminals.delete(managedTerminal.id);
            }
            // Update the managed terminal with the new handle
            managedTerminal.handle = handle;
            managedTerminal.id = handle.id;
            // Update the ID mappings
            this.terminals.set(handle.id, managedTerminal);
            this.numericIdToStringId.set(managedTerminal.numericId, handle.id);
            process.terminalId = handle.id;
            // Start the process polling
            process.run(command);
        }
        catch (error) {
            process.emit("error", error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Get or create a terminal for the specified working directory.
     * @param cwd The working directory for the terminal
     * @returns The terminal info for an available terminal
     */
    async getOrCreateTerminal(cwd) {
        // Find an available terminal with matching CWD
        for (const [_numericId, terminalInfo] of this.terminalInfos) {
            if (!terminalInfo.busy) {
                const terminal = terminalInfo.terminal;
                if (terminal._cwd === cwd) {
                    return terminalInfo;
                }
            }
        }
        // Find any available terminal if reuse is enabled
        if (this.terminalReuseEnabled) {
            for (const [_numericId, terminalInfo] of this.terminalInfos) {
                if (!terminalInfo.busy) {
                    // Update the CWD
                    const terminal = terminalInfo.terminal;
                    terminal._cwd = cwd;
                    if (terminal.shellIntegration?.cwd) {
                        terminal.shellIntegration.cwd.fsPath = cwd;
                    }
                    terminal._managedTerminal.cwd = cwd;
                    return terminalInfo;
                }
            }
        }
        // Create a new terminal
        const numericId = this.nextNumericId++;
        const placeholderId = `pending-${numericId}`;
        const managedTerminal = {
            id: placeholderId, // Will be updated when command runs
            numericId,
            handle: null, // Will be set when command runs
            command: "",
            cwd,
            createdAt: Date.now(),
            released: false,
            busy: false,
            lastCommand: "",
        };
        const acpTerminal = new AcpTerminal(managedTerminal, this);
        const terminalInfo = {
            id: numericId,
            terminal: acpTerminal,
            busy: false,
            lastCommand: "",
            lastActive: Date.now(),
        };
        this.terminals.set(managedTerminal.id, managedTerminal);
        this.numericIdToStringId.set(numericId, managedTerminal.id);
        this.terminalInfos.set(numericId, terminalInfo);
        Logger.debug("[AcpTerminalManager] Created terminal:", { numericId, cwd });
        return terminalInfo;
    }
    /**
     * Get terminals filtered by busy state.
     * @param busy Whether to get busy or idle terminals
     * @returns Array of terminal info with id and last command
     */
    getTerminals(busy) {
        const result = [];
        for (const [numericId, terminalInfo] of this.terminalInfos) {
            if (terminalInfo.busy === busy) {
                result.push({
                    id: numericId,
                    lastCommand: terminalInfo.lastCommand,
                });
            }
        }
        return result;
    }
    /**
     * Get output that hasn't been retrieved yet from a terminal.
     * @param terminalId The terminal ID (numeric)
     * @returns The unretrieved output string
     */
    getUnretrievedOutput(terminalId) {
        const process = this.processes.get(terminalId);
        return process ? process.getUnretrievedOutput() : "";
    }
    /**
     * Check if a terminal's process is actively outputting.
     * @param terminalId The terminal ID (numeric)
     * @returns Whether the process is hot
     */
    isProcessHot(terminalId) {
        const process = this.processes.get(terminalId);
        return process ? process.isHot : false;
    }
    /**
     * Dispose of all terminals and clean up resources.
     */
    disposeAll() {
        // Release all terminals
        this.releaseAll().catch((err) => {
            Logger.debug("[AcpTerminalManager] Error releasing terminals:", err);
        });
        // Clear all tracking
        this.terminals.clear();
        this.numericIdToStringId.clear();
        this.processes.clear();
        this.terminalInfos.clear();
        Logger.debug("[AcpTerminalManager] disposeAll complete");
    }
    /**
     * Set the timeout for waiting for shell integration.
     * @param timeout Timeout in milliseconds
     */
    setShellIntegrationTimeout(_timeout) {
        // no-op
    }
    /**
     * Enable or disable terminal reuse.
     * @param enabled Whether to enable terminal reuse
     */
    setTerminalReuseEnabled(enabled) {
        this.terminalReuseEnabled = enabled;
    }
    /**
     * Set the maximum number of output lines to keep.
     * @param limit Maximum number of lines
     */
    setTerminalOutputLineLimit(limit) {
        this.terminalOutputLineLimit = limit;
    }
    /**
     * Set the default terminal profile.
     * @param profile The profile identifier
     */
    setDefaultTerminalProfile(_profile) {
        // no-op
    }
    /**
     * Process output lines, potentially truncating if over limit.
     * @param outputLines Array of output lines
     * @param overrideLimit Optional limit override
     * @returns Processed output string
     */
    processOutput(outputLines, overrideLimit) {
        const limit = overrideLimit !== undefined ? overrideLimit : this.terminalOutputLineLimit;
        if (outputLines.length > limit) {
            const halfLimit = Math.floor(limit / 2);
            const start = outputLines.slice(0, halfLimit);
            const end = outputLines.slice(outputLines.length - halfLimit);
            return `${start.join("\n")}\n... (output truncated) ...\n${end.join("\n")}`.trim();
        }
        return outputLines.join("\n").trim();
    }
    // =========================================================================
    // ACP-specific Methods (original interface)
    // =========================================================================
    /**
     * Check if the client supports terminal operations.
     */
    canUseTerminal() {
        return this.clientCapabilities?.terminal === true;
    }
    /**
     * Create a new terminal and execute a command.
     *
     * @param options - Terminal creation options
     * @returns The managed terminal instance or an error
     */
    async createTerminal(options) {
        if (!this.canUseTerminal()) {
            return { error: "Client does not support terminal capability" };
        }
        Logger.debug("[AcpTerminalManager] createTerminal:", options);
        try {
            const request = {
                sessionId: this.getSessionId(),
                command: options.command,
            };
            // Add optional parameters if provided
            if (options.args !== undefined && options.args.length > 0) {
                request.args = options.args;
            }
            if (options.cwd !== undefined) {
                request.cwd = options.cwd;
            }
            if (options.env !== undefined && options.env.length > 0) {
                request.env = options.env.map((e) => ({ name: e.name, value: e.value }));
            }
            if (options.outputByteLimit !== undefined) {
                request.outputByteLimit = options.outputByteLimit;
            }
            const handle = await this.connection.createTerminal(request);
            const numericId = this.nextNumericId++;
            const managedTerminal = {
                id: handle.id,
                numericId,
                handle,
                command: options.command,
                args: options.args,
                cwd: options.cwd,
                createdAt: Date.now(),
                released: false,
                busy: true,
                lastCommand: options.command,
            };
            this.terminals.set(handle.id, managedTerminal);
            this.numericIdToStringId.set(numericId, handle.id);
            Logger.debug("[AcpTerminalManager] createTerminal success:", { id: handle.id, numericId });
            return managedTerminal;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.debug("[AcpTerminalManager] createTerminal error:", errorMessage);
            return { error: errorMessage };
        }
    }
    /**
     * Get the current output of a terminal without waiting for it to exit.
     *
     * @param terminalId - The terminal ID (string)
     * @returns The current output or an error
     */
    async getOutput(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            return {
                output: "",
                truncated: false,
                success: false,
                error: `Terminal not found: ${terminalId}`,
            };
        }
        if (terminal.released) {
            return {
                output: "",
                truncated: false,
                success: false,
                error: `Terminal has been released: ${terminalId}`,
            };
        }
        Logger.debug("[AcpTerminalManager] getOutput:", { terminalId });
        try {
            const response = await terminal.handle.currentOutput();
            const result = {
                output: response.output,
                truncated: response.truncated,
                success: true,
            };
            if (response.exitStatus) {
                result.exitStatus = {
                    exitCode: response.exitStatus.exitCode ?? undefined,
                    signal: response.exitStatus.signal ?? undefined,
                };
            }
            Logger.debug("[AcpTerminalManager] getOutput response:", {
                outputLength: response.output.length,
                truncated: response.truncated,
                hasExitStatus: !!response.exitStatus,
            });
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.debug("[AcpTerminalManager] getOutput error:", errorMessage);
            return {
                output: "",
                truncated: false,
                success: false,
                error: errorMessage,
            };
        }
    }
    /**
     * Wait for a terminal command to exit and return its exit status.
     *
     * @param terminalId - The terminal ID (string)
     * @returns The exit status or an error
     */
    async waitForExit(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            return {
                success: false,
                error: `Terminal not found: ${terminalId}`,
            };
        }
        if (terminal.released) {
            return {
                success: false,
                error: `Terminal has been released: ${terminalId}`,
            };
        }
        Logger.debug("[AcpTerminalManager] waitForExit:", { terminalId });
        try {
            const response = await terminal.handle.waitForExit();
            Logger.debug("[AcpTerminalManager] waitForExit response:", response);
            return {
                exitCode: response.exitCode ?? undefined,
                signal: response.signal ?? undefined,
                success: true,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.debug("[AcpTerminalManager] waitForExit error:", errorMessage);
            return {
                success: false,
                error: errorMessage,
            };
        }
    }
    /**
     * Kill a terminal command without releasing the terminal.
     *
     * The terminal remains valid after killing, allowing you to:
     * - Get the final output with getOutput()
     * - Check the exit status
     * - Release the terminal when done
     *
     * @param terminalId - The terminal ID (string)
     * @returns The operation result
     */
    async kill(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            return {
                success: false,
                error: `Terminal not found: ${terminalId}`,
            };
        }
        if (terminal.released) {
            return {
                success: false,
                error: `Terminal has been released: ${terminalId}`,
            };
        }
        Logger.debug("[AcpTerminalManager] kill:", { terminalId });
        try {
            await terminal.handle.kill();
            Logger.debug("[AcpTerminalManager] kill success");
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.debug("[AcpTerminalManager] kill error:", errorMessage);
            return {
                success: false,
                error: errorMessage,
            };
        }
    }
    /**
     * Release a terminal and free all associated resources.
     *
     * If the command is still running, it will be killed.
     * After release, the terminal ID becomes invalid and cannot be used
     * with other terminal methods.
     *
     * @param terminalId - The terminal ID (string)
     * @returns The operation result
     */
    async release(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            return {
                success: false,
                error: `Terminal not found: ${terminalId}`,
            };
        }
        if (terminal.released) {
            // Already released, consider it a success
            return { success: true };
        }
        Logger.debug("[AcpTerminalManager] release:", { terminalId });
        try {
            await terminal.handle.release();
            terminal.released = true;
            Logger.debug("[AcpTerminalManager] release success");
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            Logger.debug("[AcpTerminalManager] release error:", errorMessage);
            return {
                success: false,
                error: errorMessage,
            };
        }
    }
    /**
     * Get a managed terminal by its string ID.
     *
     * @param terminalId - The terminal ID (string)
     * @returns The managed terminal or undefined
     */
    getTerminal(terminalId) {
        return this.terminals.get(terminalId);
    }
    /**
     * Get all active (non-released) terminals.
     */
    getActiveTerminals() {
        return Array.from(this.terminals.values()).filter((t) => !t.released);
    }
    /**
     * Get the count of active terminals.
     */
    getActiveTerminalCount() {
        return this.getActiveTerminals().length;
    }
    /**
     * Release all active terminals.
     *
     * This is useful for cleanup when a session ends.
     */
    async releaseAll() {
        const activeTerminals = this.getActiveTerminals();
        Logger.debug("[AcpTerminalManager] releaseAll:", { count: activeTerminals.length });
        const releasePromises = activeTerminals.map((terminal) => this.release(terminal.id));
        await Promise.allSettled(releasePromises);
        Logger.debug("[AcpTerminalManager] releaseAll complete");
    }
    /**
     * Execute a command and wait for it to complete.
     *
     * This is a convenience method that creates a terminal, waits for exit,
     * gets the output, and releases the terminal.
     *
     * @param options - Terminal creation options
     * @returns The output and exit status
     */
    async executeCommand(options) {
        const terminalResult = await this.createTerminal(options);
        if ("error" in terminalResult) {
            return {
                output: "",
                success: false,
                error: terminalResult.error,
            };
        }
        const terminal = terminalResult;
        try {
            // Wait for the command to exit
            const exitResult = await this.waitForExit(terminal.id);
            if (!exitResult.success) {
                return {
                    output: "",
                    success: false,
                    error: exitResult.error,
                };
            }
            // Get the final output
            const outputResult = await this.getOutput(terminal.id);
            return {
                output: outputResult.output,
                exitCode: exitResult.exitCode,
                signal: exitResult.signal,
                success: true,
            };
        }
        finally {
            // Always release the terminal
            await this.release(terminal.id);
        }
    }
    /**
     * Get the current session ID.
     * @throws Error if session ID is not available
     */
    getSessionId() {
        const sessionId = this.sessionIdResolver();
        if (!sessionId) {
            throw new Error("Session ID is undefined. Cannot perform terminal operations.");
        }
        return sessionId;
    }
}
//# sourceMappingURL=AcpTerminalManager.js.map