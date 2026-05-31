/**
 * Sandbox Runner
 *
 * Executes code in sandboxed environments using Node.js vm or Docker containers
 * Adapted from Che's container execution model
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Logger } from '../../shared/services/Logger';
import { DEFAULT_EXECUTION_LIMITS, generateExecutionId } from './types';
/**
 * Sandbox runner for isolated code execution
 */
export class SandboxRunner extends EventEmitter {
    activeSandboxes = new Map();
    limits;
    baseTempDir;
    cleanupInterval;
    constructor(limits = {}, baseTempDir) {
        super();
        this.limits = { ...DEFAULT_EXECUTION_LIMITS, ...limits };
        this.baseTempDir = baseTempDir || path.join(os.tmpdir(), 'villa-sandboxes');
        this.startCleanupInterval();
    }
    /**
     * Execute code in a sandbox
     */
    async execute(request, workspaceId, languageConfig) {
        const executionId = generateExecutionId();
        const startTime = new Date();
        Logger.info(`[Sandbox] Starting execution ${executionId} for workspace ${workspaceId}`);
        try {
            // Create sandbox directory
            const sandboxDir = await this.createSandboxDir(executionId);
            // Write code file
            const fileName = request.fileName || this.getDefaultFileName(languageConfig.id);
            const filePath = path.join(sandboxDir, fileName);
            await fs.writeFile(filePath, request.code, 'utf-8');
            // Prepare command
            const { command, args } = this.prepareCommand(languageConfig, fileName, sandboxDir);
            // Spawn process
            const childProcess = spawn(command, args, {
                cwd: sandboxDir,
                env: { ...process.env, ...request.environment, ...languageConfig.envVars },
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false,
            });
            // Track sandbox
            const sandbox = {
                id: executionId,
                process: childProcess,
                startTime,
                output: '',
                error: '',
                status: 'running',
                request,
                workspaceId,
            };
            this.activeSandboxes.set(executionId, sandbox);
            // Set up timeout
            const timeout = request.timeout || this.limits.maxExecutionTime;
            sandbox.timeoutId = setTimeout(() => {
                this.killSandbox(executionId, 'timeout');
            }, timeout * 1000);
            // Handle output
            return new Promise((resolve, reject) => {
                let stdoutData = '';
                let stderrData = '';
                const maxOutput = this.limits.maxOutputSize;
                childProcess.stdout?.on('data', (data) => {
                    const chunk = data.toString();
                    if (stdoutData.length + chunk.length <= maxOutput) {
                        stdoutData += chunk;
                        this.emit('output', { executionId, data: chunk, type: 'stdout' });
                    }
                });
                childProcess.stderr?.on('data', (data) => {
                    const chunk = data.toString();
                    if (stderrData.length + chunk.length <= maxOutput) {
                        stderrData += chunk;
                        this.emit('output', { executionId, data: chunk, type: 'stderr' });
                    }
                });
                childProcess.on('error', (error) => {
                    Logger.error(`[Sandbox] Process error for ${executionId}:`, error);
                    sandbox.status = 'error';
                    this.cleanupSandbox(executionId);
                    reject(error);
                });
                childProcess.on('close', async (code) => {
                    const endTime = new Date();
                    const duration = endTime.getTime() - startTime.getTime();
                    if (sandbox.timeoutId) {
                        clearTimeout(sandbox.timeoutId);
                    }
                    const status = sandbox.status === 'timeout'
                        ? 'timeout'
                        : (code === 0 ? 'success' : 'error');
                    const result = {
                        executionId,
                        status,
                        stdout: stdoutData,
                        stderr: stderrData,
                        exitCode: code || 0,
                        duration,
                        startTime,
                        endTime,
                    };
                    Logger.info(`[Sandbox] Execution ${executionId} completed with status ${status}`);
                    this.cleanupSandbox(executionId);
                    this.emit('complete', result);
                    resolve(result);
                });
                // Handle stdin if provided
                if (request.input) {
                    childProcess.stdin?.write(request.input);
                    childProcess.stdin?.end();
                }
            });
        }
        catch (error) {
            Logger.error(`[Sandbox] Failed to start execution ${executionId}:`, error);
            throw error;
        }
    }
    /**
     * Kill a running sandbox
     */
    killSandbox(executionId, reason = 'cancelled') {
        const sandbox = this.activeSandboxes.get(executionId);
        if (!sandbox) {
            return false;
        }
        Logger.info(`[Sandbox] Killing execution ${executionId} (${reason})`);
        sandbox.status = reason;
        if (sandbox.timeoutId) {
            clearTimeout(sandbox.timeoutId);
        }
        // Kill process tree
        if (sandbox.process.pid) {
            try {
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', sandbox.process.pid.toString(), '/f', '/t']);
                }
                else {
                    process.kill(-sandbox.process.pid, 'SIGKILL');
                }
            }
            catch (error) {
                Logger.warn(`[Sandbox] Failed to kill process ${sandbox.process.pid}:`, error);
            }
        }
        this.cleanupSandbox(executionId);
        return true;
    }
    /**
     * Get active sandbox
     */
    getSandbox(executionId) {
        return this.activeSandboxes.get(executionId);
    }
    /**
     * List all active sandboxes
     */
    listActiveSandboxes() {
        return Array.from(this.activeSandboxes.values());
    }
    /**
     * List sandboxes for a workspace
     */
    getWorkspaceSandboxes(workspaceId) {
        return this.listActiveSandboxes().filter(s => s.workspaceId === workspaceId);
    }
    /**
     * Check if at max capacity
     */
    isAtCapacity() {
        return this.activeSandboxes.size >= this.limits.maxConcurrentExecutions;
    }
    /**
     * Create sandbox working directory
     */
    async createSandboxDir(executionId) {
        const dir = path.join(this.baseTempDir, executionId);
        await fs.mkdir(dir, { recursive: true });
        return dir;
    }
    /**
     * Cleanup sandbox resources
     */
    async cleanupSandbox(executionId) {
        const sandbox = this.activeSandboxes.get(executionId);
        if (!sandbox)
            return;
        this.activeSandboxes.delete(executionId);
        // Remove sandbox directory
        const sandboxDir = path.join(this.baseTempDir, executionId);
        try {
            await fs.rm(sandboxDir, { recursive: true, force: true });
        }
        catch (error) {
            Logger.warn(`[Sandbox] Failed to cleanup directory ${sandboxDir}:`, error);
        }
    }
    /**
     * Prepare command and arguments
     */
    prepareCommand(config, fileName, workingDir) {
        const runCommand = config.commands.run;
        // Replace placeholders
        const replaced = runCommand
            .replace('${file}', fileName)
            .replace('${filePath}', path.join(workingDir, fileName))
            .replace('${dir}', workingDir);
        // Split command and args
        const parts = replaced.split(' ');
        return {
            command: parts[0],
            args: parts.slice(1),
        };
    }
    /**
     * Get default file name for language
     */
    getDefaultFileName(language) {
        const defaults = {
            javascript: 'index.js',
            typescript: 'index.ts',
            python: 'main.py',
            java: 'Main.java',
            go: 'main.go',
            rust: 'main.rs',
            cpp: 'main.cpp',
            csharp: 'Program.cs',
            ruby: 'main.rb',
            php: 'index.php',
        };
        return defaults[language] || 'code.txt';
    }
    /**
     * Start cleanup interval for stale sandboxes
     */
    startCleanupInterval() {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const maxAge = this.limits.maxExecutionTime * 1000 + 5000; // +5s grace
            for (const [id, sandbox] of this.activeSandboxes) {
                const age = now - sandbox.startTime.getTime();
                if (age > maxAge) {
                    Logger.warn(`[Sandbox] Cleaning up stale sandbox ${id}`);
                    this.killSandbox(id, 'timeout');
                }
            }
        }, 30000); // Check every 30s
    }
    /**
     * Stop the runner and cleanup
     */
    async stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // Kill all active sandboxes
        for (const [id] of this.activeSandboxes) {
            this.killSandbox(id, 'cancelled');
        }
        // Remove temp directory
        try {
            await fs.rm(this.baseTempDir, { recursive: true, force: true });
        }
        catch (error) {
            Logger.warn('[Sandbox] Failed to cleanup base temp directory:', error);
        }
    }
}
//# sourceMappingURL=SandboxRunner.js.map