/**
 * Workspace Execution Service
 *
 * Main service for managing workspaces and code execution
 * Adapted from Che's DevWorkspace architecture
 */
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Logger } from '../../shared/services/Logger';
import { SandboxRunner } from './SandboxRunner';
import { DevfileParser } from './DevfileParser';
import { isWorkspaceActive, canStartWorkspace, canStopWorkspace, generateWorkspaceId, } from './types';
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    workspaceBaseDir: path.join(process.cwd(), '.villa-workspaces'),
    maxConcurrentWorkspaces: 10,
    defaultTimeout: 30,
    enableDocker: false, // Use process-based execution by default
};
/**
 * Workspace Execution Service
 */
export class WorkspaceExecutionService extends EventEmitter {
    workspaces = new Map();
    sandboxRunner;
    devfileParser;
    repositoryManager;
    config;
    constructor(config = {}, repositoryManager) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.sandboxRunner = new SandboxRunner();
        this.devfileParser = new DevfileParser();
        this.repositoryManager = repositoryManager;
        // Forward sandbox events
        this.sandboxRunner.on('output', (data) => {
            this.emit('execution_output', data);
        });
        this.sandboxRunner.on('complete', (result) => {
            this.emit('execution_complete', result);
        });
    }
    /**
     * Initialize workspace directory
     */
    async initialize() {
        try {
            await fs.mkdir(this.config.workspaceBaseDir, { recursive: true });
            Logger.info(`[WorkspaceService] Initialized at ${this.config.workspaceBaseDir}`);
        }
        catch (error) {
            Logger.error('[WorkspaceService] Failed to initialize:', error);
            throw error;
        }
    }
    /**
     * Create a new workspace
     */
    async createWorkspace(request) {
        const workspaceId = generateWorkspaceId(request.devfile.metadata.name);
        const localPath = path.join(this.config.workspaceBaseDir, workspaceId);
        Logger.info(`[WorkspaceService] Creating workspace ${workspaceId}`);
        try {
            // Create workspace directory
            await fs.mkdir(localPath, { recursive: true });
            // Save devfile
            const devfilePath = path.join(localPath, 'devfile.yaml');
            const devfileYaml = this.devfileParser.serialize(request.devfile);
            await fs.writeFile(devfilePath, devfileYaml, 'utf-8');
            // Create workspace object
            const workspace = {
                apiVersion: 'workspace.devfile.io/v1alpha2',
                kind: 'Workspace',
                metadata: {
                    id: workspaceId,
                    name: request.devfile.metadata.name,
                    creationTimestamp: new Date().toISOString(),
                    labels: {
                        language: request.devfile.metadata.language || 'unknown',
                        repoId: request.repoId || '',
                    },
                },
                spec: {
                    started: false,
                    template: {
                        components: request.devfile.components || [],
                        commands: request.devfile.commands || [],
                        projects: request.devfile.projects || [],
                    },
                },
                status: {
                    phase: 'stopped',
                    message: 'Workspace created',
                },
                devfile: request.devfile,
                localPath,
            };
            this.workspaces.set(workspaceId, workspace);
            this.emit('workspace_event', {
                workspaceId,
                type: 'created',
                status: 'stopped',
                timestamp: new Date(),
            });
            // Auto-start if requested
            if (request.autoStart) {
                await this.startWorkspace(workspaceId);
            }
            return workspace;
        }
        catch (error) {
            Logger.error(`[WorkspaceService] Failed to create workspace ${workspaceId}:`, error);
            throw error;
        }
    }
    /**
     * Create workspace from repository
     */
    async createWorkspaceFromRepo(repoId, language, autoStart = true) {
        // Get repository info
        if (!this.repositoryManager) {
            throw new Error('RepositoryManager not configured');
        }
        // Try to find devfile in repo
        const repoPath = path.join(process.cwd(), '.villa-repos', repoId);
        const devfileResult = await this.devfileParser.findDevfile(repoPath);
        let devfile;
        if (devfileResult?.content.valid) {
            devfile = devfileResult.content.devfile;
            Logger.info(`[WorkspaceService] Using devfile from repo ${repoId}`);
        }
        else {
            // Generate from language or auto-detect
            const detectedLang = language || await this.detectRepoLanguage(repoPath);
            if (!detectedLang) {
                throw new Error('Could not detect repository language');
            }
            devfile = this.devfileParser.generateFromLanguage(detectedLang, repoId);
            Logger.info(`[WorkspaceService] Generated devfile for ${detectedLang}`);
        }
        return this.createWorkspace({
            devfile,
            repoId,
            autoStart,
            sourceCode: { localPath: repoPath },
        });
    }
    /**
     * Start a workspace
     */
    async startWorkspace(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            throw new Error(`Workspace ${workspaceId} not found`);
        }
        if (!canStartWorkspace(workspace.status?.phase || 'stopped')) {
            throw new Error(`Cannot start workspace in state ${workspace.status?.phase}`);
        }
        Logger.info(`[WorkspaceService] Starting workspace ${workspaceId}`);
        // Update status
        workspace.status = {
            phase: 'starting',
            message: 'Initializing workspace environment',
            workspaceId,
        };
        try {
            // Get language config
            const langConfig = this.devfileParser.toLanguageConfig(workspace.devfile);
            if (!langConfig) {
                throw new Error('Could not determine language configuration');
            }
            // Setup runtime info
            workspace.runtime = {
                id: workspaceId,
                status: 'starting',
                startTime: new Date(),
                ports: [],
                endpoints: [],
            };
            // Simulate startup (in real implementation, start container/VM)
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Update to running
            workspace.status.phase = 'running';
            workspace.status.message = 'Workspace is running';
            workspace.spec.started = true;
            workspace.runtime.status = 'running';
            this.emit('workspace_event', {
                workspaceId,
                type: 'started',
                status: 'running',
                timestamp: new Date(),
            });
            return workspace;
        }
        catch (error) {
            workspace.status.phase = 'error';
            workspace.status.message = error instanceof Error ? error.message : 'Failed to start';
            this.emit('workspace_event', {
                workspaceId,
                type: 'error',
                status: 'error',
                message: workspace.status.message,
                timestamp: new Date(),
            });
            throw error;
        }
    }
    /**
     * Stop a workspace
     */
    async stopWorkspace(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            throw new Error(`Workspace ${workspaceId} not found`);
        }
        if (!canStopWorkspace(workspace.status?.phase || 'stopped')) {
            throw new Error(`Cannot stop workspace in state ${workspace.status?.phase}`);
        }
        Logger.info(`[WorkspaceService] Stopping workspace ${workspaceId}`);
        // Kill any running executions
        const executions = this.sandboxRunner.getWorkspaceSandboxes(workspaceId);
        for (const sandbox of executions) {
            this.sandboxRunner.killSandbox(sandbox.id, 'cancelled');
        }
        workspace.status = {
            phase: 'stopped',
            message: 'Workspace stopped',
            workspaceId,
        };
        workspace.spec.started = false;
        if (workspace.runtime) {
            workspace.runtime.status = 'stopped';
            workspace.runtime.endTime = new Date();
        }
        this.emit('workspace_event', {
            workspaceId,
            type: 'stopped',
            status: 'stopped',
            timestamp: new Date(),
        });
        return workspace;
    }
    /**
     * Delete a workspace
     */
    async deleteWorkspace(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            throw new Error(`Workspace ${workspaceId} not found`);
        }
        Logger.info(`[WorkspaceService] Deleting workspace ${workspaceId}`);
        // Stop if running
        if (isWorkspaceActive(workspace.status?.phase || 'stopped')) {
            await this.stopWorkspace(workspaceId);
        }
        // Remove directory
        try {
            await fs.rm(workspace.localPath, { recursive: true, force: true });
        }
        catch (error) {
            Logger.warn(`[WorkspaceService] Failed to cleanup workspace directory:`, error);
        }
        this.workspaces.delete(workspaceId);
        this.emit('workspace_event', {
            workspaceId,
            type: 'deleted',
            timestamp: new Date(),
        });
    }
    /**
     * Execute code in workspace
     */
    async executeCode(workspaceId, request) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            throw new Error(`Workspace ${workspaceId} not found`);
        }
        if (workspace.status?.phase !== 'running') {
            throw new Error('Workspace must be running to execute code');
        }
        const langConfig = this.devfileParser.toLanguageConfig(workspace.devfile);
        if (!langConfig) {
            throw new Error('Could not determine language configuration');
        }
        // Detect language from request if different
        if (request.language && request.language !== langConfig.id) {
            // Get config for requested language
            const configs = this.devfileParser.getLanguageConfigs();
            const requestedConfig = configs.find(c => c.id === request.language);
            if (requestedConfig) {
                return this.sandboxRunner.execute(request, workspaceId, requestedConfig);
            }
        }
        return this.sandboxRunner.execute(request, workspaceId, langConfig);
    }
    /**
     * Get workspace by ID
     */
    getWorkspace(workspaceId) {
        return this.workspaces.get(workspaceId);
    }
    /**
     * List all workspaces
     */
    listWorkspaces() {
        const workspaces = Array.from(this.workspaces.values());
        return {
            workspaces,
            total: workspaces.length,
        };
    }
    /**
     * Get workspace status
     */
    getWorkspaceStatus(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        return workspace?.status;
    }
    /**
     * Get workspace logs
     */
    async getWorkspaceLogs(workspaceId) {
        const workspace = this.workspaces.get(workspaceId);
        if (!workspace) {
            throw new Error(`Workspace ${workspaceId} not found`);
        }
        const logPath = path.join(workspace.localPath, 'workspace.log');
        try {
            return await fs.readFile(logPath, 'utf-8');
        }
        catch {
            return '';
        }
    }
    /**
     * Detect repository language
     */
    async detectRepoLanguage(repoPath) {
        try {
            const files = await fs.readdir(repoPath);
            // Check for language indicators
            const indicators = {
                'package.json': 'javascript',
                'requirements.txt': 'python',
                'Cargo.toml': 'rust',
                'go.mod': 'go',
                'pom.xml': 'java',
                'build.gradle': 'java',
            };
            for (const [file, lang] of Object.entries(indicators)) {
                if (files.includes(file)) {
                    return lang;
                }
            }
            // Check file extensions
            const counts = {};
            for (const file of files) {
                const ext = path.extname(file);
                if (ext) {
                    counts[ext] = (counts[ext] || 0) + 1;
                }
            }
            // Find most common extension
            const langExts = {
                '.js': 'javascript',
                '.ts': 'typescript',
                '.py': 'python',
                '.java': 'java',
                '.go': 'go',
                '.rs': 'rust',
            };
            let maxCount = 0;
            let detectedLang;
            for (const [ext, count] of Object.entries(counts)) {
                if (count > maxCount && langExts[ext]) {
                    maxCount = count;
                    detectedLang = langExts[ext];
                }
            }
            return detectedLang;
        }
        catch (error) {
            Logger.warn(`[WorkspaceService] Failed to detect language for ${repoPath}:`, error);
            return undefined;
        }
    }
    /**
     * Get devfile parser
     */
    getDevfileParser() {
        return this.devfileParser;
    }
    /**
     * Get sandbox runner
     */
    getSandboxRunner() {
        return this.sandboxRunner;
    }
    /**
     * Stop the service
     */
    async stop() {
        Logger.info('[WorkspaceService] Stopping service...');
        // Stop all workspaces
        for (const [id, workspace] of this.workspaces) {
            if (isWorkspaceActive(workspace.status?.phase || 'stopped')) {
                await this.stopWorkspace(id);
            }
        }
        // Stop sandbox runner
        await this.sandboxRunner.stop();
        this.removeAllListeners();
    }
}
//# sourceMappingURL=WorkspaceExecutionService.js.map