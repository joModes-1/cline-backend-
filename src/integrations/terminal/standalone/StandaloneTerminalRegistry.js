/**
 * StandaloneTerminalRegistry - Manages terminal instances in standalone environments.
 *
 * This class tracks and manages multiple terminal instances, providing
 * functionality to create, retrieve, update, and remove terminals.
 */
import { Logger } from "@/shared/services/Logger";
import { StandaloneTerminal } from "./StandaloneTerminal";
/**
 * Registry for tracking standalone terminal instances.
 * Provides CRUD operations for terminal management.
 */
export class StandaloneTerminalRegistry {
    /** Map of terminal ID to terminal info */
    terminals = new Map();
    /** Next available terminal ID */
    nextId = 1;
    /**
     * Create a new terminal and register it.
     * @param options Terminal creation options
     * @returns The created terminal info
     */
    createTerminal(options = {}) {
        const terminal = new StandaloneTerminal(options);
        const id = this.nextId++;
        const terminalInfo = {
            id: id,
            terminal: terminal,
            busy: false,
            lastCommand: "",
            shellPath: options.shellPath,
            lastActive: Date.now(),
            pendingCwdChange: undefined,
            cwdResolved: undefined,
        };
        this.terminals.set(id, terminalInfo);
        Logger.log(`[StandaloneTerminalRegistry] Created terminal ${id}`);
        return terminalInfo;
    }
    /**
     * Get a terminal by ID.
     * @param id The terminal ID
     * @returns The terminal info or undefined if not found
     */
    getTerminal(id) {
        return this.terminals.get(id);
    }
    /**
     * Get all registered terminals.
     * @returns Array of all terminal info objects
     */
    getAllTerminals() {
        return Array.from(this.terminals.values());
    }
    /**
     * Remove a terminal from the registry and dispose it.
     * @param id The terminal ID to remove
     */
    removeTerminal(id) {
        const terminalInfo = this.terminals.get(id);
        if (terminalInfo) {
            terminalInfo.terminal.dispose();
            this.terminals.delete(id);
            Logger.log(`[StandaloneTerminalRegistry] Removed terminal ${id}`);
        }
    }
    /**
     * Update a terminal's properties.
     * @param id The terminal ID
     * @param updates Partial terminal info to update
     */
    updateTerminal(id, updates) {
        const terminalInfo = this.terminals.get(id);
        if (terminalInfo) {
            Object.assign(terminalInfo, updates);
        }
    }
    /**
     * Clear all terminals from the registry.
     */
    clear() {
        for (const terminalInfo of this.terminals.values()) {
            terminalInfo.terminal.dispose();
        }
        this.terminals.clear();
        this.nextId = 1;
        Logger.log(`[StandaloneTerminalRegistry] Cleared all terminals`);
    }
    /**
     * Get the count of registered terminals.
     * @returns Number of terminals
     */
    get size() {
        return this.terminals.size;
    }
}
//# sourceMappingURL=StandaloneTerminalRegistry.js.map