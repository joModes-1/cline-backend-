/**
 * StandaloneTerminal - A terminal wrapper for standalone environments.
 *
 * This class provides a terminal abstraction that works outside of VSCode,
 * implementing the ITerminal interface for compatibility with the terminal manager.
 */
import { Logger } from "@/shared/services/Logger";
/**
 * A standalone terminal implementation that doesn't depend on VSCode.
 * Used in CLI and JetBrains environments.
 */
export class StandaloneTerminal {
    /** Terminal name */
    name;
    /** Promise that resolves to the process ID */
    processId;
    /** Terminal creation options */
    creationOptions;
    /** Exit status (if terminal has exited) */
    exitStatus;
    /** Terminal state */
    state;
    /** Current working directory */
    _cwd;
    /** Shell path */
    _shellPath;
    /** Active child process */
    _process = null;
    /** Process ID of the active process */
    _processId = null;
    /** Mock shell integration for compatibility */
    shellIntegration;
    constructor(options = {}) {
        this.name = options.name || `Terminal ${Math.floor(Math.random() * 10000)}`;
        this.processId = Promise.resolve(Math.floor(Math.random() * 100000));
        this.creationOptions = options;
        this.exitStatus = undefined;
        this.state = { isInteractedWith: false };
        this._cwd = options.cwd || process.cwd();
        this._shellPath = options.shellPath;
        // Mock shell integration for compatibility
        this.shellIntegration = {
            cwd: { fsPath: this._cwd },
            executeCommand: (_command) => {
                // Return a mock execution object that the TerminalProcess expects
                return {
                    read: async function* () {
                        // This will be handled by our StandaloneTerminalProcess
                        yield "";
                    },
                };
            },
        };
        Logger.log(`[StandaloneTerminal] Created terminal: ${this.name} in ${this._cwd}`);
    }
    /**
     * Send text to the terminal.
     * @param text The text to send
     * @param addNewLine Whether to add a newline (default: true)
     */
    sendText(text, addNewLine = true) {
        Logger.log(`[StandaloneTerminal] sendText: ${text}`);
        // If we have an active process, send input to it
        if (this._process && !this._process.killed) {
            try {
                this._process.stdin?.write(text + (addNewLine ? "\n" : ""));
            }
            catch (error) {
                Logger.error(`[StandaloneTerminal] Error sending text to process:`, error);
            }
        }
        else {
            // For compatibility with old behavior, we could spawn a new process
            Logger.log(`[StandaloneTerminal] No active process to send text to`);
        }
    }
    /**
     * Show the terminal (no-op in standalone mode).
     */
    show() {
        Logger.log(`[StandaloneTerminal] show: ${this.name}`);
        this.state.isInteractedWith = true;
    }
    /**
     * Hide the terminal (no-op in standalone mode).
     */
    hide() {
        Logger.log(`[StandaloneTerminal] hide: ${this.name}`);
    }
    /**
     * Dispose of the terminal and kill any running process.
     */
    dispose() {
        Logger.log(`[StandaloneTerminal] dispose: ${this.name}`);
        if (this._process && !this._process.killed) {
            this._process.kill("SIGTERM");
        }
    }
}
//# sourceMappingURL=StandaloneTerminal.js.map