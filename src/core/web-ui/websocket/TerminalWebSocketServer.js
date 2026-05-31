/**
 * Terminal WebSocket Server
 *
 * Manages WebSocket connections for terminal sessions
 * Handles protocol, session management, and message routing
 */
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { Logger } from '../../../shared/services/Logger';
import { generateTerminalId, createOutputMessage } from '../../../services/workspace/types/index';
import { TerminalSession } from './TerminalSession';
/**
 * Terminal WebSocket Server
 */
export class TerminalWebSocketServer {
    wss;
    sessions = new Map();
    heartbeatInterval;
    pingInterval = 30000; // 30 seconds
    constructor(port) {
        this.wss = new WebSocketServer({
            port: port || 0,
        });
        this.setupWebSocketServer();
        this.startHeartbeat();
    }
    /**
     * Setup WebSocket server event handlers
     */
    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            Logger.info('[TerminalWebSocket] New connection from', req.socket.remoteAddress);
            ws.isAlive = true;
            // Parse workspace ID from URL
            const workspaceId = this.extractWorkspaceId(req);
            if (!workspaceId) {
                Logger.warn('[TerminalWebSocket] Missing workspace ID in connection URL');
                ws.close(4000, 'Missing workspace ID');
                return;
            }
            ws.workspaceId = workspaceId;
            // Handle messages
            ws.on('message', (data) => {
                this.handleMessage(ws, data);
            });
            // Handle pong (heartbeat response)
            ws.on('pong', () => {
                ws.isAlive = true;
            });
            // Handle close
            ws.on('close', (code, reason) => {
                Logger.info(`[TerminalWebSocket] Connection closed: ${code} - ${reason.toString()}`);
                this.handleDisconnect(ws);
            });
            // Handle errors
            ws.on('error', (error) => {
                Logger.error('[TerminalWebSocket] WebSocket error:', error);
            });
            // Send ready message
            this.send(ws, { type: 'ready', timestamp: new Date() });
        });
        this.wss.on('error', (error) => {
            Logger.error('[TerminalWebSocket] Server error:', error);
        });
    }
    /**
     * Extract workspace ID from request URL
     */
    extractWorkspaceId(req) {
        try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            return url.searchParams.get('workspace') || undefined;
        }
        catch {
            return undefined;
        }
    }
    /**
     * Handle incoming WebSocket message
     */
    handleMessage(ws, data) {
        try {
            const message = JSON.parse(data.toString());
            switch (message.type) {
                case 'input':
                    this.handleInput(ws, message.data || '');
                    break;
                case 'resize':
                    if (message.rows && message.cols) {
                        this.handleResize(ws, message.rows, message.cols);
                    }
                    break;
                case 'ping':
                    this.send(ws, { type: 'pong', timestamp: new Date() });
                    break;
                case 'close':
                    ws.close(1000, 'Client requested close');
                    break;
                default:
                    Logger.warn(`[TerminalWebSocket] Unknown message type: ${message.type}`);
            }
        }
        catch (error) {
            Logger.error('[TerminalWebSocket] Failed to parse message:', error);
            this.send(ws, {
                type: 'error',
                data: 'Invalid message format',
                timestamp: new Date(),
            });
        }
    }
    /**
     * Handle terminal input from client
     */
    handleInput(ws, data) {
        if (!ws.sessionId) {
            // Create new session on first input
            this.createSession(ws).then(session => {
                session.write(data);
            }).catch(error => {
                Logger.error('[TerminalWebSocket] Failed to create session:', error);
                this.send(ws, {
                    type: 'error',
                    data: 'Failed to create terminal session',
                    timestamp: new Date(),
                });
            });
            return;
        }
        const session = this.sessions.get(ws.sessionId);
        if (session && session.isActive()) {
            session.write(data);
        }
    }
    /**
     * Handle terminal resize
     */
    handleResize(ws, rows, cols) {
        if (!ws.sessionId)
            return;
        const session = this.sessions.get(ws.sessionId);
        if (session) {
            session.resize(rows, cols);
        }
    }
    /**
     * Create new terminal session
     */
    async createSession(ws) {
        const sessionId = generateTerminalId();
        const workspaceId = ws.workspaceId;
        Logger.info(`[TerminalWebSocket] Creating session ${sessionId} for workspace ${workspaceId}`);
        const session = new TerminalSession(sessionId, workspaceId, {
            userId: ws.userId,
            rows: 24,
            cols: 80,
            cwd: process.cwd(),
        });
        // Handle session events
        session.on('data', (data) => {
            this.send(ws, createOutputMessage(data));
        });
        session.on('exit', ({ exitCode, signal }) => {
            this.send(ws, {
                type: 'exit',
                code: exitCode,
                signal,
                timestamp: new Date(),
            });
            this.sessions.delete(sessionId);
        });
        session.on('ready', () => {
            this.send(ws, { type: 'ready', timestamp: new Date() });
        });
        // Start session
        await session.start();
        this.sessions.set(sessionId, session);
        ws.sessionId = sessionId;
        return session;
    }
    /**
     * Handle WebSocket disconnect
     */
    handleDisconnect(ws) {
        if (ws.sessionId) {
            const session = this.sessions.get(ws.sessionId);
            if (session) {
                // Don't kill session immediately - allow reconnect
                setTimeout(() => {
                    // Check if reconnected
                    const reconnected = Array.from(this.wss.clients).some(client => client.sessionId === ws.sessionId);
                    if (!reconnected) {
                        Logger.info(`[TerminalWebSocket] Cleaning up session ${ws.sessionId} after disconnect`);
                        session.kill();
                        this.sessions.delete(ws.sessionId);
                    }
                }, 60000); // 1 minute grace period
            }
        }
    }
    /**
     * Send message to WebSocket
     */
    send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }
    /**
     * Start heartbeat to detect dead connections
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (!ws.isAlive) {
                    Logger.warn('[TerminalWebSocket] Terminating inactive connection');
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, this.pingInterval);
    }
    /**
     * Get session by ID
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Get all sessions for a workspace
     */
    getWorkspaceSessions(workspaceId) {
        return Array.from(this.sessions.values()).filter(session => session.workspaceId === workspaceId);
    }
    /**
     * Kill all sessions for a workspace
     */
    killWorkspaceSessions(workspaceId) {
        const sessions = this.getWorkspaceSessions(workspaceId);
        for (const session of sessions) {
            Logger.info(`[TerminalWebSocket] Killing session ${session.id} for workspace ${workspaceId}`);
            session.kill();
            this.sessions.delete(session.id);
        }
    }
    /**
     * Get server stats
     */
    getStats() {
        return {
            connections: this.wss.clients.size,
            sessions: this.sessions.size,
        };
    }
    /**
     * Stop the server
     */
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        // Close all sessions
        for (const [id, session] of this.sessions) {
            session.kill();
        }
        this.sessions.clear();
        // Close WebSocket server
        this.wss.close();
    }
}
//# sourceMappingURL=TerminalWebSocketServer.js.map