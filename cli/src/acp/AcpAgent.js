/**
 * AcpAgent - Thin wrapper that bridges stdio connection to ClineAgent.
 *
 * This class wraps the ClineAgent and connects it to an ACP AgentSideConnection
 * for stdio-based communication. It:
 * - Wires up the permission handler to call connection.requestPermission()
 * - Subscribes to ClineAgent session events and forwards them to connection.sessionUpdate()
 * - Delegates all acp.Agent methods to the internal ClineAgent
 *
 * For programmatic usage without stdio, use ClineAgent directly.
 *
 * @module acp
 */
import { Logger } from "@/shared/services/Logger.js";
import { ClineAgent } from "../agent/ClineAgent.js";
/**
 * ACP Agent wrapper that bridges stdio connection to ClineAgent.
 *
 * This is the class used by runAcpMode() for stdio-based ACP communication.
 * It creates an internal ClineAgent and wires up the connection for:
 * - Permission requests (via connection.requestPermission)
 * - Session updates (via connection.sessionUpdate)
 */
export class AcpAgent {
    connection;
    clineAgent;
    /** Track which sessions we've subscribed to for event forwarding */
    subscribedSessions = new Set();
    constructor(connection, options) {
        this.connection = connection;
        // Create the internal ClineAgent
        this.clineAgent = new ClineAgent(options);
        // Wire up the permission handler to use the connection
        this.clineAgent.setPermissionHandler(async (request) => {
            try {
                Logger.debug("[AcpAgent] Forwarding permission request to connection");
                return await this.connection.requestPermission({
                    sessionId: request.sessionId,
                    toolCall: request.toolCall,
                    options: request.options,
                });
            }
            catch (error) {
                Logger.debug("[AcpAgent] Error requesting permission:", error);
                return { outcome: { outcome: "cancelled" } };
            }
        });
    }
    /**
     * Subscribe to session events and forward them to the connection.
     */
    subscribeToSessionEvents(sessionId) {
        if (this.subscribedSessions.has(sessionId)) {
            return;
        }
        const emitter = this.clineAgent.emitterForSession(sessionId);
        // Forward session update by adding the sessionUpdate discriminator
        const forwardSessionUpdate = (eventName) => {
            emitter.on(eventName, (payload) => {
                const update = {
                    sessionUpdate: eventName,
                    ...payload,
                };
                this.connection.sessionUpdate({ sessionId, update }).catch((error) => {
                    Logger.error(`[AcpAgent] Error forwarding ${eventName}:`, error);
                });
            });
        };
        // Forward all standard session updates
        forwardSessionUpdate("agent_message_chunk");
        forwardSessionUpdate("agent_thought_chunk");
        forwardSessionUpdate("tool_call");
        forwardSessionUpdate("tool_call_update");
        forwardSessionUpdate("available_commands_update");
        forwardSessionUpdate("plan");
        forwardSessionUpdate("current_mode_update");
        forwardSessionUpdate("user_message_chunk");
        forwardSessionUpdate("config_option_update");
        forwardSessionUpdate("session_info_update");
        // Handle errors specially (not part of ACP SessionUpdate)
        emitter.on("error", (error) => {
            Logger.error("[AcpAgent] Session error:", error);
        });
        this.subscribedSessions.add(sessionId);
    }
    // ============================================================
    // acp.Agent Interface Implementation - Delegate to ClineAgent
    // ============================================================
    async initialize(params) {
        return await this.clineAgent.initialize(params, this.connection);
    }
    async newSession(params) {
        const response = await this.clineAgent.newSession(params);
        // Subscribe to events for this new session
        this.subscribeToSessionEvents(response.sessionId);
        return response;
    }
    async prompt(params) {
        // Ensure we're subscribed to this session's events
        this.subscribeToSessionEvents(params.sessionId);
        return this.clineAgent.prompt(params);
    }
    async cancel(params) {
        return this.clineAgent.cancel(params);
    }
    async setSessionMode(params) {
        return this.clineAgent.setSessionMode(params);
    }
    async unstable_setSessionModel(params) {
        return this.clineAgent.unstable_setSessionModel(params);
    }
    async authenticate(params) {
        return this.clineAgent.authenticate(params);
    }
    async shutdown() {
        this.subscribedSessions.clear();
        return this.clineAgent.shutdown();
    }
}
//# sourceMappingURL=AcpAgent.js.map