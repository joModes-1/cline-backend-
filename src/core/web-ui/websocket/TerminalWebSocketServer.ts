/**
 * Terminal WebSocket Server
 * 
 * Manages WebSocket connections for terminal sessions
 * Handles protocol, session management, and message routing
 */

import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { Logger } from '../../../shared/services/Logger';
import type { TerminalMessage } from '../../../services/workspace/types/index';
import { generateTerminalId, createOutputMessage } from '../../../services/workspace/types/index';
import { TerminalSession } from './TerminalSession';

/**
 * WebSocket with session info
 */
interface TerminalWebSocket extends WebSocket {
  sessionId?: string;
  workspaceId?: string;
  userId?: string;
  isAlive?: boolean;
}

/**
 * Terminal WebSocket Server
 */
export class TerminalWebSocketServer {
  private wss: WebSocketServer;
  private sessions: Map<string, TerminalSession> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private pingInterval = 30000; // 30 seconds

  constructor(port?: number) {
    this.wss = new WebSocketServer({ 
      port: port || 0,
    } as any);

    this.setupWebSocketServer();
    this.startHeartbeat();
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: TerminalWebSocket, req: IncomingMessage) => {
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
      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data);
      });

      // Handle pong (heartbeat response)
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle close
      ws.on('close', (code: number, reason: Buffer) => {
        Logger.info(`[TerminalWebSocket] Connection closed: ${code} - ${reason.toString()}`);
        this.handleDisconnect(ws);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        Logger.error('[TerminalWebSocket] WebSocket error:', error);
      });

      // Send ready message
      this.send(ws, { type: 'ready', timestamp: new Date() });
    });

    this.wss.on('error', (error: Error) => {
      Logger.error('[TerminalWebSocket] Server error:', error);
    });
  }

  /**
   * Extract workspace ID from request URL
   */
  private extractWorkspaceId(req: IncomingMessage): string | undefined {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      return url.searchParams.get('workspace') || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: TerminalWebSocket, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as TerminalMessage;

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
    } catch (error) {
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
  private handleInput(ws: TerminalWebSocket, data: string): void {
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
  private handleResize(ws: TerminalWebSocket, rows: number, cols: number): void {
    if (!ws.sessionId) return;

    const session = this.sessions.get(ws.sessionId);
    if (session) {
      session.resize(rows, cols);
    }
  }

  /**
   * Create new terminal session
   */
  private async createSession(ws: TerminalWebSocket): Promise<TerminalSession> {
    const sessionId = generateTerminalId();
    const workspaceId = ws.workspaceId!;

    Logger.info(`[TerminalWebSocket] Creating session ${sessionId} for workspace ${workspaceId}`);

    const session = new TerminalSession(sessionId, workspaceId, {
      userId: ws.userId,
      rows: 24,
      cols: 80,
      cwd: process.cwd(),
    });

    // Handle session events
    session.on('data', (data: string) => {
      this.send(ws, createOutputMessage(data));
    });

    session.on('exit', ({ exitCode, signal }: { exitCode?: number; signal?: string }) => {
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
  private handleDisconnect(ws: TerminalWebSocket): void {
    if (ws.sessionId) {
      const session = this.sessions.get(ws.sessionId);
      if (session) {
        // Don't kill session immediately - allow reconnect
        setTimeout(() => {
          // Check if reconnected
          const reconnected = Array.from(this.wss.clients).some(
            client => (client as TerminalWebSocket).sessionId === ws.sessionId
          );
          if (!reconnected) {
            Logger.info(`[TerminalWebSocket] Cleaning up session ${ws.sessionId} after disconnect`);
            session.kill();
            this.sessions.delete(ws.sessionId!);
          }
        }, 60000); // 1 minute grace period
      }
    }
  }

  /**
   * Send message to WebSocket
   */
  private send(ws: TerminalWebSocket, message: TerminalMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: TerminalWebSocket) => {
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
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for a workspace
   */
  getWorkspaceSessions(workspaceId: string): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.workspaceId === workspaceId
    );
  }

  /**
   * Kill all sessions for a workspace
   */
  killWorkspaceSessions(workspaceId: string): void {
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
  getStats(): { connections: number; sessions: number } {
    return {
      connections: this.wss.clients.size,
      sessions: this.sessions.size,
    };
  }

  /**
   * Stop the server
   */
  stop(): void {
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
