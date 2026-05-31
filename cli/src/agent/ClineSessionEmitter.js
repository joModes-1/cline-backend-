/**
 * Typed EventEmitter for per-session ACP events.
 *
 * This class provides a type-safe wrapper around Node's EventEmitter
 * for emitting and subscribing to session-specific ACP events.
 *
 * @module acp
 */
import { EventEmitter } from "events";
/**
 * Type-safe EventEmitter for ClineAgent session events.
 *
 * Each session has its own emitter instance, allowing consumers to
 * subscribe to events for specific sessions without filtering.
 *
 * @example
 * ```typescript
 * const agent = new ClineAgent({ version: "1.0.0" })
 * const session = await agent.newSession({ cwd: "/path/to/project" })
 *
 * // Subscribe to session events
 * agent.session(session.sessionId).on("agent_message_chunk", (content) => {
 *   console.log("Agent says:", content.text)
 * })
 *
 * agent.session(session.sessionId).on("tool_call", (toolCall) => {
 *   console.log("Tool called:", toolCall.toolName)
 * })
 * ```
 */
export class ClineSessionEmitter {
    emitter;
    constructor() {
        this.emitter = new EventEmitter();
        // Increase max listeners since we may have many event types
        this.emitter.setMaxListeners(20);
    }
    /**
     * Subscribe to a session event.
     *
     * @param event - The event name to subscribe to
     * @param listener - The callback function to invoke when the event is emitted
     * @returns This emitter instance for chaining
     */
    on(event, listener) {
        this.emitter.on(event, listener);
        return this;
    }
    /**
     * Subscribe to a session event for a single invocation.
     *
     * @param event - The event name to subscribe to
     * @param listener - The callback function to invoke when the event is emitted
     * @returns This emitter instance for chaining
     */
    once(event, listener) {
        this.emitter.once(event, listener);
        return this;
    }
    /**
     * Unsubscribe from a session event.
     *
     * @param event - The event name to unsubscribe from
     * @param listener - The callback function to remove
     * @returns This emitter instance for chaining
     */
    off(event, listener) {
        this.emitter.off(event, listener);
        return this;
    }
    /**
     * Emit a session event.
     *
     * @param event - The event name to emit
     * @param args - The arguments to pass to the event listeners
     * @returns True if the event had listeners, false otherwise
     */
    emit(event, ...args) {
        return this.emitter.emit(event, ...args);
    }
    /**
     * Remove all listeners for a specific event or all events.
     *
     * @param event - Optional event name to remove listeners for
     * @returns This emitter instance for chaining
     */
    removeAllListeners(event) {
        if (event) {
            this.emitter.removeAllListeners(event);
        }
        else {
            this.emitter.removeAllListeners();
        }
        return this;
    }
    /**
     * Get the number of listeners for a specific event.
     *
     * @param event - The event name to count listeners for
     * @returns The number of listeners
     */
    listenerCount(event) {
        return this.emitter.listenerCount(event);
    }
}
//# sourceMappingURL=ClineSessionEmitter.js.map