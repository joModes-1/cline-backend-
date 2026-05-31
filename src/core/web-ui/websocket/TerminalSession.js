/**
 * Terminal Session
 *
 * Manages a single terminal session using node-pty
 * Handles PTY process lifecycle and I/O streaming
 */
import { spawn } from 'node-pty';
import { EventEmitter } from 'events';
import { Logger } from '../../../shared/services/Logger';
/**
 * Terminal session implementation
 */
export class TerminalSession extends EventEmitter {
    id;
    workspaceId;
    userId;
    status = 'connecting';
    createdAt;
    lastActivityAt;
    rows;
    cols;
    shell;
    cwd;
    environment;
    pty;
    buffer = '';
    maxBufferSize = 10000;
    constructor(id, workspaceId, options = {}) {
        super();
        this.id = id;
        this.workspaceId = workspaceId;
        this.userId = options.userId;
        this.rows = options.rows || 24;
        this.cols = options.cols || 80;
        this.shell = options.shell || process.platform === 'win32' ? 'powershell.exe' : 'bash';
        this.cwd = options.cwd || process.cwd();
        this.environment = options.environment || {};
        this.createdAt = new Date();
        this.lastActivityAt = new Date();
    }
    /**
     * Start the terminal session
     */
    async start() {
        try {
            Logger.info(`[TerminalSession] Starting session ${this.id} with shell ${this.shell}`);
            // Spawn PTY
            this.pty = spawn(this.shell, [], {
                name: 'xterm-color',
                cols: this.cols,
                rows: this.rows,
                cwd: this.cwd,
                env: {
                    ...process.env,
                    ...this.environment,
                    TERM: 'xterm-256color',
                    COLORTERM: 'truecolor',
                },
            });
            // Handle data from PTY
            this.pty.onData((data) => {
                this.buffer += data;
                if (this.buffer.length > this.maxBufferSize) {
                    this.buffer = this.buffer.slice(-this.maxBufferSize);
                }
                this.lastActivityAt = new Date();
                this.emit('data', data);
            });
            // Handle PTY exit
            this.pty.onExit(({ exitCode, signal }) => {
                Logger.info(`[TerminalSession] Session ${this.id} exited with code ${exitCode}, signal ${signal}`);
                this.status = 'disconnected';
                this.emit('exit', { exitCode, signal });
            });
            this.status = 'connected';
            Logger.info(`[TerminalSession] Session ${this.id} started successfully`);
            this.emit('ready');
        }
        catch (error) {
            this.status = 'error';
            Logger.error(`[TerminalSession] Failed to start session ${this.id}:`, error);
            throw error;
        }
    }
    /**
     * Write data to terminal (from client)
     */
    write(data) {
        if (!this.pty || this.status !== 'connected') {
            Logger.warn(`[TerminalSession] Cannot write to session ${this.id}: not connected`);
            return;
        }
        this.pty.write(data);
        this.lastActivityAt = new Date();
    }
    /**
     * Resize terminal
     */
    resize(rows, cols) {
        if (!this.pty || this.status !== 'connected') {
            return;
        }
        this.rows = rows;
        this.cols = cols;
        this.pty.resize(cols, rows);
        Logger.debug(`[TerminalSession] Resized session ${this.id} to ${cols}x${rows}`);
    }
    /**
     * Kill the terminal session
     */
    kill(signal) {
        if (!this.pty) {
            return;
        }
        Logger.info(`[TerminalSession] Killing session ${this.id} with signal ${signal || 'SIGTERM'}`);
        try {
            if (signal) {
                this.pty.kill(signal);
            }
            else {
                this.pty.kill();
            }
        }
        catch (error) {
            Logger.warn(`[TerminalSession] Error killing session ${this.id}:`, error);
        }
        this.status = 'disconnected';
    }
    /**
     * Get current buffer content
     */
    getBuffer() {
        return this.buffer;
    }
    /**
     * Clear buffer
     */
    clearBuffer() {
        this.buffer = '';
    }
    /**
     * Get session info
     */
    getInfo() {
        return {
            id: this.id,
            workspaceId: this.workspaceId,
            userId: this.userId,
            status: this.status,
            createdAt: this.createdAt,
            lastActivityAt: this.lastActivityAt,
            rows: this.rows,
            cols: this.cols,
            shell: this.shell,
            cwd: this.cwd,
            environment: this.environment,
        };
    }
    /**
     * Check if session is active
     */
    isActive() {
        return this.status === 'connected';
    }
    /**
     * Get process ID
     */
    getPid() {
        return this.pty?.pid;
    }
}
//# sourceMappingURL=TerminalSession.js.map