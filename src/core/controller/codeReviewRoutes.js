/**
 * REST API Routes for Villa Code Review
 *
 * Provides endpoints for:
 * - Repository management (GitHub clone, zip upload)
 * - Code review requests
 * - Repository scanning
 * - File operations
 */
import { Router } from "express";
import { RepositoryManager } from "../../services/codeReview/RepositoryManager";
import { VillaCodeReviewService } from "../../services/codeReview/VillaCodeReviewService";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { Logger } from "../../shared/services/Logger";
import { HostProvider } from "../../hosts/host-provider";
import { createTwoFilesPatch } from "diff";
import { User } from "../../models/User";
import jwt from "jsonwebtoken";
// JWT Secret (must match villa-server.ts)
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-to-64-char-random-string';
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
        // Also accept token from query param (for OAuth popup)
        const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
        const token = headerToken || queryToken;
        if (!token) {
            res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
            return;
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.sub);
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
            return;
        }
        req.user = { id: user._id.toString(), email: user.email };
        next();
    }
    catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
            return;
        }
        next(error);
    }
}
const autofixSnapshots = new Map();
// Persist snapshots to disk so they survive server restarts
const SNAPSHOTS_FILE = path.join(os.tmpdir(), 'villa-autofix-snapshots.json');
function loadSnapshotsFromDisk() {
    try {
        if (fs.existsSync(SNAPSHOTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(SNAPSHOTS_FILE, 'utf-8'));
            if (data && typeof data === 'object') {
                for (const [key, value] of Object.entries(data)) {
                    autofixSnapshots.set(key, value);
                }
                Logger.info(`[API] Loaded ${autofixSnapshots.size} autofix snapshots from disk`);
            }
        }
    }
    catch (e) {
        Logger.warn('[API] Failed to load snapshots from disk:', e);
    }
}
function saveSnapshotsToDisk() {
    try {
        const data = {};
        for (const [key, value] of autofixSnapshots.entries()) {
            data[key] = value;
        }
        fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    }
    catch (e) {
        Logger.warn('[API] Failed to save snapshots to disk:', e);
    }
}
// Load snapshots on startup
loadSnapshotsFromDisk();
function normalizeRepoFilePath(filePath) {
    return String(filePath)
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/^\/+/, "");
}
function getAutofixSnapshotKey(repoId, taskId, filePath) {
    return `${repoId}::${taskId}::${filePath}`;
}
export function createCodeReviewRouter(controller) {
    const router = Router();
    const repoManager = new RepositoryManager();
    const codeReviewService = new VillaCodeReviewService(controller, controller.stateManager);
    // GitHub OAuth config
    const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
    const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
    const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/github/callback';
    // ============================================
    // GitHub OAuth Routes
    // ============================================
    /**
     * GET /api/github/auth
     * Start GitHub OAuth flow
     */
    router.get("/github/auth", authenticate, (req, res) => {
        const userId = req.user.id;
        const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
        const githubAuthUrl = `https://github.com/login/oauth/authorize?` + new URLSearchParams({
            client_id: GITHUB_CLIENT_ID,
            redirect_uri: GITHUB_CALLBACK_URL,
            scope: 'repo read:user',
            state: state,
        }).toString();
        Logger.info(`[API] Redirecting user ${userId} to GitHub OAuth`);
        res.redirect(githubAuthUrl);
    });
    /**
     * GET /api/github/callback
     * GitHub OAuth callback - exchange code for token
     */
    router.get("/github/callback", async (req, res) => {
        const { code, state, error } = req.query;
        if (error) {
            Logger.error(`[API] GitHub OAuth error: ${error}`);
            res.redirect('/repositories?github_error=access_denied');
            return;
        }
        if (!code || !state) {
            Logger.error('[API] GitHub OAuth callback missing code or state');
            res.redirect('/repositories?github_error=invalid_callback');
            return;
        }
        try {
            // Exchange code for access token
            const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_id: GITHUB_CLIENT_ID,
                    client_secret: GITHUB_CLIENT_SECRET,
                    code: code,
                    redirect_uri: GITHUB_CALLBACK_URL,
                }),
            });
            const tokenData = await tokenResponse.json();
            if (tokenData.error) {
                Logger.error(`[API] GitHub token exchange failed: ${tokenData.error}`);
                res.redirect('/repositories?github_error=token_exchange_failed');
                return;
            }
            const accessToken = tokenData.access_token;
            // Get user info from state
            let userId;
            try {
                const stateData = JSON.parse(Buffer.from(String(state), 'base64').toString());
                userId = stateData.userId;
            }
            catch {
                Logger.error('[API] Invalid OAuth state');
                res.redirect('/repositories?github_error=invalid_state');
                return;
            }
            // Save token to user
            const user = await User.findById(userId);
            if (!user) {
                Logger.error(`[API] User not found: ${userId}`);
                res.redirect('/repositories?github_error=user_not_found');
                return;
            }
            user.githubAccessToken = accessToken;
            user.githubConnectedAt = new Date();
            await user.save();
            Logger.info(`[API] GitHub connected for user ${userId}`);
            res.redirect('/repositories?github_connected=true');
        }
        catch (error) {
            Logger.error('[API] GitHub OAuth callback error:', error);
            res.redirect('/repositories?github_error=callback_failed');
        }
    });
    /**
     * GET /api/github/status
     * Check if user has connected GitHub
     */
    router.get("/github/status", authenticate, async (req, res) => {
        try {
            const user = await User.findById(req.user.id).select('+githubAccessToken +githubConnectedAt');
            res.json({
                success: true,
                data: {
                    connected: !!user?.githubAccessToken,
                    connectedAt: user?.githubConnectedAt,
                },
            });
        }
        catch (error) {
            Logger.error('[API] GitHub status check failed:', error);
            res.status(500).json({ success: false, error: 'Failed to check GitHub status' });
        }
    });
    /**
     * GET /api/github/repos
     * List user's GitHub repositories
     */
    router.get("/github/repos", authenticate, async (req, res) => {
        try {
            const user = await User.findById(req.user.id).select('+githubAccessToken');
            if (!user?.githubAccessToken) {
                res.status(401).json({
                    success: false,
                    error: 'GitHub not connected. Please connect your GitHub account first.',
                });
                return;
            }
            // Fetch repos from GitHub API
            const reposResponse = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
                headers: {
                    'Authorization': `token ${user.githubAccessToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Villa-Code-Review/1.0',
                },
            });
            if (!reposResponse.ok) {
                if (reposResponse.status === 401) {
                    // Token expired or invalid
                    user.githubAccessToken = undefined;
                    await user.save();
                    res.status(401).json({
                        success: false,
                        error: 'GitHub token expired. Please reconnect your account.',
                    });
                    return;
                }
                throw new Error(`GitHub API error: ${reposResponse.status}`);
            }
            const repos = await reposResponse.json();
            Logger.info(`[API] Fetched ${repos.length} repos for user ${req.user.id}`);
            res.json({
                success: true,
                data: repos.map((r) => ({
                    id: r.id,
                    name: r.name,
                    fullName: r.full_name,
                    description: r.description,
                    private: r.private,
                    url: r.html_url,
                    cloneUrl: r.clone_url,
                    defaultBranch: r.default_branch,
                    updatedAt: r.updated_at,
                })),
            });
        }
        catch (error) {
            Logger.error('[API] Failed to fetch GitHub repos:', error);
            res.status(500).json({ success: false, error: 'Failed to fetch repositories' });
        }
    });
    // ============================================
    // Repository Management
    // ============================================
    /**
     * POST /api/repos/github/clone
     * Clone a GitHub repository
     */
    router.post("/repos/github/clone", authenticate, async (req, res) => {
        Logger.info("[API] POST /api/repos/github/clone - GitHub clone request received");
        try {
            const { owner, repo, branch = "main", token } = req.body;
            const userId = req.user.id;
            Logger.info(`[API] Clone params - owner: ${owner}, repo: ${repo}, branch: ${branch}, user: ${userId}`);
            if (!owner || !repo) {
                Logger.warn("[API] ✗ Missing required fields: owner or repo");
                res.status(400).json({
                    success: false,
                    error: "Missing required fields: owner, repo",
                });
                return;
            }
            Logger.info(`[API] Starting GitHub clone: ${owner}/${repo}`);
            const repository = await repoManager.cloneGitHubRepo({
                owner,
                repo,
                branch,
                token,
            });
            // Save repo to user's repositories in MongoDB
            const user = await User.findById(userId);
            if (user) {
                const repoData = {
                    id: repository.id,
                    name: repository.name,
                    url: repository.githubUrl || `https://github.com/${owner}/${repo}`,
                    owner,
                    repo,
                    branch,
                    localPath: repository.localPath, // IMPORTANT: store localPath for file ops
                    source: 'github',
                    isActive: true,
                    createdAt: new Date()
                };
                // Check if repo already exists
                const existingRepo = user.repositories.find(r => r.id === repository.id);
                if (!existingRepo) {
                    user.repositories.push(repoData);
                    // Mark array as modified to ensure Mongoose saves it
                    user.markModified('repositories');
                    await user.save();
                    Logger.info(`[API] Repository saved to user ${userId}`);
                }
            }
            Logger.info(`[API] ✓ Clone successful: ${repository.id}`);
            res.json({
                success: true,
                data: {
                    repoId: repository.id,
                    name: repository.name,
                    status: repository.status,
                    githubUrl: repository.githubUrl,
                    localPath: repository.localPath,
                    owner,
                    repo,
                    branch,
                    createdAt: repository.createdAt,
                },
            });
        }
        catch (error) {
            Logger.error("[API] ✗ GitHub clone failed:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Clone failed",
            });
        }
    });
    /**
     * GET /api/repos/:repoId/autofix/:taskId/diff
     * Get unified diff between snapshot(before) and current file content(after).
     */
    router.get("/repos/:repoId/autofix/:taskId/diff", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const taskId = String(req.params.taskId);
            const filePath = normalizeRepoFilePath(String(req.query.file || ""));
            const userId = req.user.id;
            if (!filePath) {
                res.status(400).json({ success: false, error: "Missing query param: file" });
                return;
            }
            const snapshotKey = getAutofixSnapshotKey(repoId, taskId, filePath);
            const snapshot = autofixSnapshots.get(snapshotKey);
            if (!snapshot) {
                Logger.warn(`[API] No snapshot found for diff (repoId=${repoId}, taskId=${taskId}, file=${filePath}). Falling back to empty before-content.`);
            }
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({ success: false, error: "Repository not found" });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({ success: false, error: "Repository not ready" });
                return;
            }
            let after = "";
            try {
                after = await repoManager.getFileContent(localPath, filePath);
            }
            catch (e) {
                Logger.error("[API] Failed to read file for diff:", e);
                res.status(500).json({ success: false, error: "Failed to read file for diff" });
                return;
            }
            const before = snapshot?.before ?? "";
            const hasChanges = before !== after;
            // `createTwoFilesPatch` returns a ~111-char header-only string even when before === after.
            // The plain-text diff-poll uses `text.trim().length > 0` to decide a diff has arrived, so a
            // header-only patch makes it stop polling and render "0 changes" — masking the case where
            // the AI's edit silently reverted (e.g. `replace_in_file` SEARCH-block mismatch). Send an
            // empty body when nothing actually changed so polling continues until the task ends.
            const diffText = hasChanges
                ? createTwoFilesPatch(filePath, filePath, before, after, "before", "after", { context: 3 })
                : "";
            // Surface task state so the UI knows whether to keep polling or render the final diff.
            const activeTask = controller.task;
            const isThisTask = activeTask?.taskId === taskId;
            const isRunning = isThisTask ? activeTask.taskState.isStreaming === true : false;
            const didEditFile = isThisTask ? activeTask.taskState.didEditFile === true : hasChanges;
            // Support both legacy plain-text consumers and JSON consumers via Accept header
            if (req.accepts("json") && req.get("accept")?.includes("application/json")) {
                res.json({
                    success: true,
                    data: {
                        filePath,
                        diff: diffText,
                        hasChanges,
                        beforeLength: before.length,
                        afterLength: after.length,
                        taskRunning: isRunning,
                        didEditFile,
                    },
                });
            }
            else {
                res.type("text/plain");
                res.set("X-Autofix-Has-Changes", String(hasChanges));
                res.set("X-Autofix-Task-Running", String(isRunning));
                res.set("X-Autofix-Did-Edit-File", String(didEditFile));
                res.send(diffText);
            }
        }
        catch (error) {
            Logger.error("[API] Failed to get autofix diff:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to get diff",
            });
        }
    });
    /**
     * GET /api/repos/:repoId/autofix/:taskId/status
     * Lightweight polling endpoint: is the AI still working, did it edit yet?
     */
    router.get("/repos/:repoId/autofix/:taskId/status", authenticate, async (req, res) => {
        try {
            const taskId = String(req.params.taskId);
            const activeTask = controller.task;
            const isThisTask = activeTask?.taskId === taskId;
            res.json({
                success: true,
                data: {
                    taskId,
                    isActive: isThisTask,
                    isStreaming: isThisTask ? activeTask.taskState.isStreaming === true : false,
                    didEditFile: isThisTask ? activeTask.taskState.didEditFile === true : false,
                    didFinishStream: isThisTask ? activeTask.taskState.didCompleteReadingStream === true : true,
                    consecutiveMistakeCount: isThisTask ? activeTask.taskState.consecutiveMistakeCount : 0,
                },
            });
        }
        catch (error) {
            Logger.error("[API] Failed to get autofix status:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to get status",
            });
        }
    });
    /**
     * GET /api/repos/:repoId/autofix/:taskId/snapshot
     * Get the original snapshot content for diff comparison.
     */
    router.get("/repos/:repoId/autofix/:taskId/snapshot", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const taskId = String(req.params.taskId);
            const filePath = normalizeRepoFilePath(String(req.query.file || ""));
            if (!filePath) {
                res.status(400).json({ success: false, error: "Missing query param: file" });
                return;
            }
            const snapshotKey = getAutofixSnapshotKey(repoId, taskId, filePath);
            const snapshot = autofixSnapshots.get(snapshotKey);
            if (!snapshot) {
                res.json({
                    success: true,
                    data: {
                        filePath,
                        originalContent: "",
                    },
                });
                return;
            }
            res.json({
                success: true,
                data: {
                    filePath: snapshot.filePath,
                    originalContent: snapshot.before,
                },
            });
        }
        catch (error) {
            Logger.error("[API] Failed to get snapshot:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to get snapshot",
            });
        }
    });
    /**
     * POST /api/repos/:repoId/autofix/:taskId/accept
     * Accept the autofix by clearing the snapshot (keeps current file content).
     */
    router.post("/repos/:repoId/autofix/:taskId/accept", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const taskId = String(req.params.taskId);
            const filePath = normalizeRepoFilePath(String(req.query.file || ""));
            if (!filePath) {
                res.status(400).json({ success: false, error: "Missing query param: file" });
                return;
            }
            const snapshotKey = getAutofixSnapshotKey(repoId, taskId, filePath);
            if (autofixSnapshots.has(snapshotKey)) {
                autofixSnapshots.delete(snapshotKey);
                saveSnapshotsToDisk();
            }
            res.json({ success: true, data: { accepted: true } });
        }
        catch (error) {
            Logger.error("[API] Failed to accept autofix:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to accept autofix",
            });
        }
    });
    /**
     * POST /api/repos/:repoId/autofix/:taskId/reject
     * Reject the autofix by restoring the file to the snapshot content.
     */
    router.post("/repos/:repoId/autofix/:taskId/reject", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const taskId = String(req.params.taskId);
            const filePath = normalizeRepoFilePath(String(req.query.file || ""));
            const userId = req.user.id;
            if (!filePath) {
                res.status(400).json({ success: false, error: "Missing query param: file" });
                return;
            }
            const snapshotKey = getAutofixSnapshotKey(repoId, taskId, filePath);
            const snapshot = autofixSnapshots.get(snapshotKey);
            if (!snapshot) {
                res.status(404).json({ success: false, error: "No snapshot found for this task/file" });
                return;
            }
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({ success: false, error: "Repository not found" });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({ success: false, error: "Repository not ready" });
                return;
            }
            try {
                await repoManager.writeFileContent(localPath, filePath, snapshot.before ?? "");
            }
            catch (e) {
                Logger.error("[API] Failed to restore file on reject:", e);
                res.status(500).json({ success: false, error: "Failed to restore file" });
                return;
            }
            autofixSnapshots.delete(snapshotKey);
            saveSnapshotsToDisk();
            res.json({ success: true, data: { rejected: true } });
        }
        catch (error) {
            Logger.error("[API] Failed to reject autofix:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to reject autofix",
            });
        }
    });
    /**
     * POST /api/repos/:repoId/autofix
     * Start a Cline-powered auto-fix task for a single issue.
     *
     * Body:
     * - issue: { id, file, line, severity, type, message, code?, suggestion?, description? }
     */
    router.post("/repos/:repoId/autofix", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            const issue = req.body?.issue;
            if (!issue?.file || !issue?.message) {
                res.status(400).json({
                    success: false,
                    error: "Missing required issue fields (file, message)",
                });
                return;
            }
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({
                    success: false,
                    error: "Repository not found",
                });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({
                    success: false,
                    error: "Repository not ready",
                });
                return;
            }
            // Read file content for context
            let fileContent = "";
            try {
                fileContent = await repoManager.getFileContent(localPath, String(issue.file));
            }
            catch (e) {
                Logger.warn(`[API] Failed to read issue file for autofix: ${issue.file}`, e);
            }
            // Short-circuit no-op fixes: if the suggested replacement already exists verbatim in
            // the file, kicking off a Cline task would just rewrite the file to its current
            // contents — wasting LLM tokens and showing the user "AI did not modify the file".
            // Detect this up-front and return a clear signal so the UI can mark the issue as
            // already resolved without entering the polling state.
            const suggestedReplacement = issue?.suggestedFix?.replacement;
            if (fileContent.length > 0 &&
                typeof suggestedReplacement === "string" &&
                suggestedReplacement.trim().length > 0 &&
                fileContent.includes(suggestedReplacement)) {
                Logger.info(`[API] Autofix skipped: suggested replacement already present in ${issue.file}`);
                res.json({
                    success: true,
                    data: {
                        alreadyResolved: true,
                        message: "This issue's suggested fix is already present in the file. Nothing to change.",
                    },
                });
                return;
            }
            // Force Cline's workspace root to the repo folder for this task
            HostProvider.overrideWorkspacePaths([localPath]);
            // Auto-fix tasks should be able to write their edits to disk without waiting
            // for an interactive approval response from the UI.
            // backgroundEditEnabled forces FileEditProvider (direct fs.writeFile) instead of
            // ExternalDiffViewProvider (gRPC-backed editor UI that doesn't exist in headless mode).
            const autofixTaskSettings = {
                backgroundEditEnabled: true,
                autoApprovalSettings: {
                    ...controller.stateManager.getGlobalSettingsKey("autoApprovalSettings"),
                    actions: {
                        ...controller.stateManager.getGlobalSettingsKey("autoApprovalSettings").actions,
                        editFiles: true,
                        editFilesExternally: false,
                    },
                },
            };
            // Heuristic: for small/medium files, prefer write_to_file (full rewrite, no fuzzy
            // SEARCH match required). replace_in_file is fragile — a single whitespace
            // mismatch causes the edit to revert silently. Threshold ~6KB keeps token
            // cost reasonable while covering 90%+ of source files in typical apps.
            const preferWholeRewrite = fileContent.length > 0 && fileContent.length <= 6000;
            const toolGuidance = preferWholeRewrite
                ? `**You MUST use the \`write_to_file\` tool** to apply the fix. Pass the COMPLETE updated file content. Do NOT use replace_in_file — full rewrite is more reliable for files this size.`
                : `Use the \`replace_in_file\` tool with EXACT SEARCH/REPLACE blocks. The SEARCH text must match the file byte-for-byte including whitespace, indentation, and line endings. If a SEARCH block fails to match, the file is reverted and you must retry with a more accurate block.`;
            const prompt = `You are Cline running inside Villa Code Reviewer. Apply an auto-fix for the single issue below.\n\n` +
                `Rules:\n` +
                `- Make the minimal change needed to fix the issue, nothing else.\n` +
                `- ${toolGuidance}\n` +
                `- After the file is updated, call \`attempt_completion\` immediately. Do NOT run commands, tests, or further exploration.\n\n` +
                `Issue (JSON):\n${JSON.stringify(issue, null, 2)}\n\n` +
                `File path (relative to workspace root): ${issue.file}\n\n` +
                `Current file content:\n\n\`\`\`\n${fileContent}\n\`\`\`\n`;
            // Start a Cline task using the controller, forcing the workspace to the repo folder
            const taskId = await controller.initTask(prompt, undefined, undefined, undefined, autofixTaskSettings, localPath);
            // Save a snapshot for diff viewing later
            try {
                const normalizedIssueFile = normalizeRepoFilePath(String(issue.file));
                const snapshotKey = getAutofixSnapshotKey(repoId, taskId, normalizedIssueFile);
                autofixSnapshots.set(snapshotKey, {
                    filePath: normalizedIssueFile,
                    before: fileContent,
                });
                saveSnapshotsToDisk();
            }
            catch (e) {
                Logger.warn("[API] Failed to store autofix snapshot", e);
            }
            res.json({
                success: true,
                data: {
                    taskId,
                },
            });
        }
        catch (error) {
            Logger.error("[API] Autofix failed:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Autofix failed",
            });
        }
    });
    /**
     * POST /api/repos/zip/upload
     * Upload and extract a zip file
     */
    router.post("/repos/zip/upload", authenticate, async (req, res) => {
        Logger.info("[API] POST /api/repos/zip/upload - Zip upload request received");
        try {
            const candidate = req.files && req.files.zip
                ? req.files.zip
                : req.files && req.files.file
                    ? req.files.file
                    : undefined;
            const zipFile = Array.isArray(candidate) ? candidate[0] : candidate;
            if (!zipFile) {
                Logger.warn("[API] ✗ No zip file uploaded");
                res.status(400).json({
                    success: false,
                    error: "No zip file uploaded",
                });
                return;
            }
            const uploaded = zipFile;
            const userId = req.user.id;
            Logger.info(`[API] Zip file: ${uploaded.name}, Size: ${uploaded.size} bytes, User: ${userId}`);
            const buffer = Buffer.isBuffer(uploaded.data) ? uploaded.data : Buffer.from(uploaded.data);
            Logger.info(`[API] Buffer prepared: ${buffer.length} bytes`);
            Logger.info(`[API] Starting zip extraction: ${uploaded.name}`);
            const repository = await repoManager.extractZipFile(buffer, uploaded.name);
            // Save repo to user's repositories in MongoDB
            const user = await User.findById(userId);
            if (user) {
                const repoData = {
                    id: repository.id,
                    name: repository.name,
                    url: `local://zip/${uploaded.name}`,
                    owner: 'local',
                    repo: repository.name,
                    branch: 'main',
                    localPath: repository.localPath, // IMPORTANT: store localPath for file ops
                    createdAt: new Date()
                };
                const existingRepo = user.repositories.find(r => r.id === repository.id);
                if (!existingRepo) {
                    user.repositories.push(repoData);
                    await user.save();
                    Logger.info(`[API] ✓ Repository saved to user ${userId}`);
                }
            }
            Logger.info(`[API] ✓ Zip extraction successful: ${repository.id}`);
            res.json({
                success: true,
                data: {
                    repoId: repository.id,
                    name: repository.name,
                    status: repository.status,
                    createdAt: repository.createdAt,
                },
            });
        }
        catch (error) {
            Logger.error("[API] ✗ Zip upload failed:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Upload failed",
            });
        }
    });
    /**
     * GET /api/repos
     * List all repositories for the authenticated user
     */
    router.get("/repos", authenticate, async (req, res) => {
        Logger.info("[API] GET /api/repos - List repositories request");
        try {
            const userId = req.user.id;
            // Get repos from MongoDB User model
            const user = await User.findById(userId).select('repositories');
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            // Get file counts for each repo from disk using localPath
            const reposWithStats = await Promise.all(user.repositories.map(async (repo) => {
                let fileCount = 0;
                try {
                    if (repo.localPath) {
                        const files = await repoManager.scanRepository(repo.localPath);
                        fileCount = files.length;
                    }
                }
                catch (e) {
                    // Repo may not be on disk yet
                }
                return {
                    id: repo.id,
                    repoId: repo.id, // Frontend expects repoId
                    name: repo.name,
                    url: repo.url,
                    owner: repo.owner,
                    repo: repo.repo,
                    branch: repo.branch,
                    localPath: repo.localPath,
                    source: repo.source || 'github',
                    isActive: repo.isActive !== false,
                    createdAt: repo.createdAt,
                    fileCount,
                    status: fileCount > 0 ? 'ready' : 'cloning'
                };
            }));
            Logger.info(`[API] ✓ Returning ${reposWithStats.length} repositories for user ${userId}`);
            res.json({
                success: true,
                data: { repositories: reposWithStats },
            });
        }
        catch (error) {
            Logger.error("[API] ✗ Failed to list repositories:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to list repositories",
            });
        }
    });
    /**
     * GET /api/repos/:repoId
     * Get repository details - uses MongoDB for metadata, disk for files
     */
    router.get("/repos/:repoId", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({
                    success: false,
                    error: "Repository not found",
                });
                return;
            }
            // Get stats and files from disk using localPath
            let stats = null;
            let files = [];
            const localPath = repoMeta.localPath;
            if (localPath) {
                try {
                    stats = await repoManager.getRepositoryStats(localPath);
                    files = (await repoManager.listAllFiles(localPath)).map((f) => f.replace(/\\/g, "/"));
                }
                catch (e) {
                    Logger.warn("Failed to get stats/files:", e);
                }
            }
            res.json({
                success: true,
                data: {
                    debugFilesMode: "all",
                    id: repoMeta.id,
                    name: repoMeta.name,
                    url: repoMeta.url,
                    owner: repoMeta.owner,
                    repo: repoMeta.repo,
                    branch: repoMeta.branch,
                    localPath,
                    createdAt: repoMeta.createdAt,
                    files,
                    stats,
                    status: files.length > 0 ? 'ready' : 'cloning'
                },
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to get repository",
            });
        }
    });
    /**
     * DELETE /api/repos/:repoId
     * Delete a repository - removes from MongoDB and disk
     */
    router.delete("/repos/:repoId", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoIndex = user.repositories.findIndex((r) => r.id === repoId);
            if (repoIndex === -1) {
                res.status(404).json({
                    success: false,
                    error: "Repository not found",
                });
                return;
            }
            const repoMeta = user.repositories[repoIndex];
            const localPath = repoMeta.localPath;
            // Delete files from disk
            if (localPath) {
                await repoManager.deleteRepository(localPath);
            }
            // Remove from MongoDB
            user.repositories.splice(repoIndex, 1);
            await user.save();
            res.json({
                success: true,
                message: "Repository deleted",
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Delete failed",
            });
        }
    });
    // ============================================
    // Code Review
    // ============================================
    /**
     * POST /api/repos/:repoId/scan
     * Scan entire repository for issues
     */
    router.post("/repos/:repoId/scan", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            const { maxFiles = 50, maxFileSize = 250000 } = req.body;
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({
                    success: false,
                    error: "Repository not found",
                });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({
                    success: false,
                    error: "Repository not ready",
                });
                return;
            }
            Logger.info(`========================================`);
            Logger.info(`[API] STARTING REPOSITORY SCAN: ${repoId}`);
            Logger.info(`[API] Repository: ${repoMeta.name}`);
            Logger.info(`[API] Max files: ${maxFiles}, Max size: ${maxFileSize}`);
            Logger.info(`========================================`);
            // Check API configuration first
            const apiConfig = controller.stateManager.getApiConfiguration();
            if (!apiConfig.apiKey) {
                Logger.error('[API] ✗ No API key configured!');
                res.status(400).json({
                    success: false,
                    error: "API not configured. Please add your API key in Settings → AI API Configuration.",
                });
                return;
            }
            Logger.info(`[API] Using API provider: ${apiConfig.actModeApiProvider || 'default'}`);
            Logger.info(`[API] API key: ${apiConfig.apiKey.substring(0, 10)}...`);
            Logger.info(`[API] Scanning repository files...`);
            const scanResult = await codeReviewService.scanRepository({
                repoPath: localPath,
                maxFiles,
                maxFileSize,
            });
            Logger.info(`[API] Scan complete. Found ${scanResult.summary.totalFiles} files, ${scanResult.summary.totalIssues} total issues`);
            // Transform scan result to match frontend ReviewResult format
            const flatIssues = scanResult.files.flatMap(file => file.issues.map(issue => ({
                ...issue,
                file: file.path,
                line: issue.line || 1,
                column: issue.column || 1,
                severity: issue.severity || 'warning',
                type: issue.ruleId || 'general',
                message: issue.message,
                code: issue.suggestedFix?.replacement,
                suggestion: issue.suggestedFix?.description,
            })));
            const result = {
                repoId,
                issues: flatIssues,
                summary: {
                    totalFiles: scanResult.summary.totalFiles,
                    filesWithIssues: scanResult.files.filter(f => f.issues.length > 0).length,
                    criticalCount: scanResult.summary.errors,
                    warningCount: scanResult.summary.warnings,
                    infoCount: scanResult.summary.totalIssues - scanResult.summary.errors - scanResult.summary.warnings,
                },
                completedAt: new Date().toISOString(),
            };
            Logger.info(`[API] Returning ${flatIssues.length} issues to frontend`);
            Logger.info(`========================================`);
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Scan failed";
            Logger.error("[API] Repository scan failed:", error);
            // Return detailed error message to frontend
            res.status(500).json({
                success: false,
                error: errorMessage,
                details: error instanceof Error ? error.stack : undefined,
            });
        }
    });
    /**
     * POST /api/repos/:repoId/review
     * Review a specific file in the repository
     */
    router.post("/repos/:repoId/review", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            const { filePath, preferences, skipCache } = req.body;
            if (!filePath) {
                res.status(400).json({
                    success: false,
                    error: "Missing filePath",
                });
                return;
            }
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({
                    success: false,
                    error: "Repository not found",
                });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({
                    success: false,
                    error: "Repository not ready",
                });
                return;
            }
            // Read file content
            const content = await repoManager.getFileContent(localPath, filePath);
            Logger.info(`Reviewing file: ${filePath} in ${repoId}`);
            // Review the file
            const result = await codeReviewService.reviewFile({
                content,
                fileName: filePath,
                preferences,
                skipCache,
            });
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            Logger.error("File review failed:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Review failed",
            });
        }
    });
    /**
     * GET /api/repos/:repoId/files
     * List all code files in repository
     */
    router.get("/repos/:repoId/files", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({ success: false, error: "Repository not found" });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({ success: false, error: "Repository not ready" });
                return;
            }
            const files = (await repoManager.listAllFiles(localPath)).map((f) => f.replace(/\\/g, "/"));
            res.json({
                success: true,
                data: { debugFilesMode: "all", files },
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to list files",
            });
        }
    });
    /**
     * GET /api/repos/:repoId/file?path=:filePath
     * Get file content via query parameter
     */
    router.get("/repos/:repoId/file", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            const filePath = String(req.query.path || '');
            // Prevent browser/proxy caching so the editor always fetches fresh content
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({ success: false, error: "Repository not found" });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({ success: false, error: "Repository not ready" });
                return;
            }
            const content = await repoManager.getFileContent(localPath, filePath);
            res.json({
                success: true,
                data: {
                    filePath,
                    content,
                },
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to read file",
            });
        }
    });
    /**
     * PUT /api/repos/:repoId/file
     * Save/update file content
     */
    router.put("/repos/:repoId/file", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            const { path: filePath, content } = req.body;
            if (!filePath || typeof content !== 'string') {
                res.status(400).json({
                    success: false,
                    error: { code: 'MISSING_PARAMS', message: 'File path and content are required' }
                });
                return;
            }
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({ success: false, error: "Repository not found" });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({ success: false, error: "Repository not ready" });
                return;
            }
            // Security: Ensure the file is within the repo directory
            const targetPath = path.join(localPath, filePath);
            const resolvedRepoPath = path.resolve(localPath);
            const resolvedFilePath = path.resolve(targetPath);
            if (!resolvedFilePath.startsWith(resolvedRepoPath)) {
                res.status(403).json({ success: false, error: "Access denied" });
                return;
            }
            // Ensure directory exists
            const dir = path.dirname(targetPath);
            await fs.promises.mkdir(dir, { recursive: true });
            // Write file content
            await fs.promises.writeFile(targetPath, content, 'utf-8');
            Logger.info(`[API] File saved: ${filePath} in repo ${repoId}`);
            res.json({
                success: true,
                message: "File saved successfully",
                data: { filePath }
            });
        }
        catch (error) {
            Logger.error("[API] Save file failed:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to save file",
            });
        }
    });
    /**
     * POST /api/repos/:repoId/fix
     * Apply AI-suggested fix to a file
     */
    router.post("/repos/:repoId/fix", authenticate, async (req, res) => {
        try {
            const repoId = String(req.params.repoId);
            const userId = req.user.id;
            const { filePath, fix } = req.body;
            if (!filePath || !fix) {
                res.status(400).json({
                    success: false,
                    error: "Missing filePath or fix",
                });
                return;
            }
            // Get repo metadata from MongoDB
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: "User not found" });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({ success: false, error: "Repository not found" });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({ success: false, error: "Repository not ready" });
                return;
            }
            Logger.info(`Applying fix to: ${filePath} in ${repoId}`);
            const success = await codeReviewService.applyFix(path.join(localPath, filePath), fix);
            // Clear any autofix snapshot for this file after fix is applied
            const snapshotKey = getAutofixSnapshotKey(repoId, 'fix-' + Date.now(), filePath);
            if (autofixSnapshots.has(snapshotKey)) {
                autofixSnapshots.delete(snapshotKey);
            }
            if (!success) {
                res.status(400).json({
                    success: false,
                    error: "Failed to apply fix",
                });
                return;
            }
            res.json({
                success: true,
                message: "Fix applied successfully",
            });
        }
        catch (error) {
            Logger.error("Apply fix failed:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Fix failed",
            });
        }
    });
    /**
     * POST /api/review/direct
     * Direct code review (no repository needed)
     */
    router.post("/review/direct", async (req, res) => {
        try {
            const { content, fileName, language, preferences, skipCache } = req.body;
            if (!content || !fileName) {
                res.status(400).json({
                    success: false,
                    error: "Missing content or fileName",
                });
                return;
            }
            Logger.info(`Direct review: ${fileName}`);
            const result = await codeReviewService.reviewFile({
                content,
                fileName,
                language,
                preferences,
                skipCache,
            });
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            Logger.error("Direct review failed:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Review failed",
            });
        }
    });
    // ============================================
    // API Key Management
    // ============================================
    // In-memory storage for API keys (per session)
    const userApiKeys = new Map();
    /**
     * GET /api/user/apikeys
     * Get user's API keys (masked)
     */
    router.get("/user/apikeys", (req, res) => {
        const sessionId = req.headers.authorization?.slice(7) || 'anonymous';
        const keys = userApiKeys.get(sessionId) || {};
        // Return masked keys
        const maskedKeys = {};
        for (const [provider, key] of Object.entries(keys)) {
            maskedKeys[provider] = key ? `${key.slice(0, 8)}...${key.slice(-4)}` : null;
        }
        res.json({ success: true, data: maskedKeys });
    });
    /**
     * POST /api/user/apikeys
     * Save API key
     */
    router.post("/user/apikeys", (req, res) => {
        const sessionId = req.headers.authorization?.slice(7) || 'anonymous';
        const { provider, apiKey } = req.body;
        if (!provider || !apiKey) {
            res.status(400).json({ success: false, error: "Missing provider or apiKey" });
            return;
        }
        const currentKeys = userApiKeys.get(sessionId) || {};
        currentKeys[provider] = apiKey;
        userApiKeys.set(sessionId, currentKeys);
        Logger.info(`[API] API key saved for provider: ${provider}`);
        res.json({ success: true, message: "API key saved" });
    });
    /**
     * DELETE /api/user/apikeys/:provider
     * Remove API key
     */
    router.delete("/user/apikeys/:provider", (req, res) => {
        const sessionId = req.headers.authorization?.slice(7) || 'anonymous';
        const { provider } = req.params;
        const providerKey = Array.isArray(provider) ? provider[0] : provider;
        const currentKeys = userApiKeys.get(sessionId) || {};
        delete currentKeys[providerKey];
        userApiKeys.set(sessionId, currentKeys);
        Logger.info(`[API] API key removed for provider: ${provider}`);
        res.json({ success: true, message: "API key removed" });
    });
    /**
     * GET /api/code-review/settings
     * Get code review settings and API configuration
     */
    router.get("/code-review/settings", (req, res) => {
        try {
            const apiConfig = controller.stateManager.getApiConfiguration();
            res.json({
                success: true,
                data: {
                    apiProvider: apiConfig.actModeApiProvider,
                    apiModel: apiConfig.actModeApiModelId,
                    apiKeyConfigured: !!apiConfig.apiKey,
                    validationEnabled: true,
                    maxIssuesPerFile: 20,
                    severityThreshold: 'warning',
                    includeSuggestions: true,
                    autoScan: false,
                },
            });
        }
        catch (error) {
            Logger.error("[API] Failed to get settings:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to get settings",
            });
        }
    });
    /**
     * POST /api/code-review/settings
     * Update code review settings
     */
    router.post("/code-review/settings", async (req, res) => {
        try {
            const { maxIssuesPerFile, severityThreshold, includeSuggestions, autoScan } = req.body;
            // Settings would be persisted here
            Logger.info(`[API] Updated code review settings:`, { maxIssuesPerFile, severityThreshold });
            res.json({
                success: true,
                message: "Settings updated",
                data: {
                    maxIssuesPerFile,
                    severityThreshold,
                    includeSuggestions,
                    autoScan,
                },
            });
        }
        catch (error) {
            Logger.error("[API] Failed to update settings:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to update settings",
            });
        }
    });
    /**
     * POST /api/code-review/configure-api
     * Configure API key for validation
     */
    router.post("/code-review/configure-api", async (req, res) => {
        try {
            const { apiProvider, apiKey, apiModel } = req.body;
            if (!apiProvider || !apiKey) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields: apiProvider, apiKey",
                });
                return;
            }
            // Update API configuration in state manager
            await controller.stateManager.setGlobalState('actModeApiProvider', apiProvider);
            await controller.stateManager.setSecret('apiKey', apiKey);
            // Map model ID into the provider-specific state key the handler actually reads.
            // Generic actModeApiModelId is ignored by handlers like OpenRouter/DeepSeek/etc.,
            // so without this mapping the model selection from the dashboard is silently dropped.
            if (apiModel) {
                const providerModelKeyMap = {
                    openrouter: 'actModeOpenRouterModelId',
                    cline: 'actModeClineModelId',
                    openai: 'actModeOpenAiModelId',
                    ollama: 'actModeOllamaModelId',
                    lmstudio: 'actModeLmStudioModelId',
                    litellm: 'actModeLiteLlmModelId',
                    requesty: 'actModeRequestyModelId',
                    together: 'actModeTogetherModelId',
                    fireworks: 'actModeFireworksModelId',
                    'sap-ai-core': 'actModeSapAiCoreModelId',
                    groq: 'actModeGroqModelId',
                    baseten: 'actModeBasetenModelId',
                    'huggingface': 'actModeHuggingFaceModelId',
                    'huawei-cloud-maas': 'actModeHuaweiCloudMaasModelId',
                    oca: 'actModeOcaModelId',
                    aihubmix: 'actModeAihubmixModelId',
                    hicap: 'actModeHicapModelId',
                    'nous-research': 'actModeNousResearchModelId',
                    'vercel-ai-gateway': 'actModeVercelAiGatewayModelId',
                };
                const providerKey = providerModelKeyMap[apiProvider];
                if (providerKey) {
                    await controller.stateManager.setGlobalState(providerKey, apiModel);
                    Logger.info(`[API] Saved model "${apiModel}" to ${providerKey}`);
                }
                // Also keep the generic key in sync for providers that read it (anthropic etc.)
                await controller.stateManager.setGlobalState('actModeApiModelId', apiModel);
            }
            Logger.info(`[API] API configured for provider: ${apiProvider}, model: ${apiModel || '(default)'}`);
            res.json({
                success: true,
                message: "API configured successfully",
                data: {
                    apiProvider,
                    apiModel,
                    configured: true,
                },
            });
        }
        catch (error) {
            Logger.error("[API] Failed to configure API:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to configure API",
            });
        }
    });
    /**
     * GET /api/code-review/validate-api
     * Validate API configuration
     */
    router.get("/code-review/validate-api", async (req, res) => {
        try {
            const apiConfig = controller.stateManager.getApiConfiguration();
            if (!apiConfig.apiKey) {
                res.json({
                    success: true,
                    data: {
                        valid: false,
                        message: "API key not configured",
                    },
                });
                return;
            }
            // Try to build API handler to validate
            try {
                const { buildApiHandler } = await import('../../core/api');
                const apiHandler = buildApiHandler(apiConfig, 'act');
                res.json({
                    success: true,
                    data: {
                        valid: true,
                        provider: apiConfig.actModeApiProvider,
                        model: apiConfig.actModeApiModelId,
                        message: "API configuration is valid",
                    },
                });
            }
            catch (handlerError) {
                res.json({
                    success: true,
                    data: {
                        valid: false,
                        provider: apiConfig.actModeApiProvider,
                        message: "Invalid API configuration: " + (handlerError instanceof Error ? handlerError.message : "Unknown error"),
                    },
                });
            }
        }
        catch (error) {
            Logger.error("[API] Failed to validate API:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to validate API",
            });
        }
    });
    // ============================================
    // Health & Stats
    // ============================================
    /**
     * GET /api/health
     * Health check endpoint
     */
    router.get("/health", (req, res) => {
        res.json({
            success: true,
            status: "ok",
            timestamp: new Date().toISOString(),
        });
    });
    /**
     * GET /api/stats
     * Get service statistics
     */
    router.get("/stats", authenticate, async (req, res) => {
        try {
            const userId = req.user.id;
            const user = await User.findById(userId);
            const repoCount = user?.repositories?.length || 0;
            res.json({
                success: true,
                data: {
                    repositories: {
                        total: repoCount,
                    },
                    cache: codeReviewService.getCacheStats?.() || { hits: 0, misses: 0 },
                },
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Failed to get stats",
            });
        }
    });
    /**
     * POST /api/chat
     * Real AI chat using the configured API key.
     * Body: { messages: [{role, content}], fileContext?: string, fileName?: string }
     */
    router.post("/chat", authenticate, async (req, res) => {
        try {
            const { messages, fileContext, fileName } = req.body;
            if (!messages || !Array.isArray(messages) || messages.length === 0) {
                res.status(400).json({ success: false, error: "messages array required" });
                return;
            }
            const apiConfig = controller.stateManager.getApiConfiguration();
            if (!apiConfig.apiKey) {
                res.status(400).json({ success: false, error: "API key not configured. Go to Settings → AI API Configuration." });
                return;
            }
            const { buildApiHandler } = await import('../../core/api');
            const apiHandler = buildApiHandler(apiConfig, 'act');
            // Build system prompt
            const systemPrompt = fileContext
                ? `You are Villa AI, an expert code reviewer and software engineer. The user is reviewing the file "${fileName || 'unknown'}". Here is the file content for context:\n\n\`\`\`\n${fileContext.slice(0, 8000)}\n\`\`\`\n\nProvide concise, actionable answers. When suggesting code changes, use code blocks.`
                : `You are Villa AI, an expert code reviewer and software engineer embedded in the Villa Code Reviewer IDE. Help the user understand, fix, and improve their code. Provide concise, actionable answers. When suggesting code changes, use code blocks.`;
            // Convert messages to ClineStorageMessage format
            const clineMessages = messages.map((m) => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content,
            }));
            // Stream response and collect
            let fullResponse = '';
            const stream = apiHandler.createMessage(systemPrompt, clineMessages);
            for await (const chunk of stream) {
                if (chunk.type === 'text') {
                    fullResponse += chunk.text;
                }
            }
            res.json({ success: true, data: { content: fullResponse || "I couldn't generate a response. Please try again." } });
        }
        catch (error) {
            Logger.error("[API] Chat failed:", error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Chat failed",
            });
        }
    });
    // ─── Villa Audit Engine ──────────────────────────────────────────────────────
    router.post('/audit/:repoId', authenticate, async (req, res) => {
        try {
            const { repoId } = req.params;
            const { skipParsers } = req.body;
            const userId = req.user.id;
            // Look up repo from MongoDB (same pattern as all other routes)
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ success: false, error: 'User not found' });
                return;
            }
            const repoMeta = user.repositories.find((r) => r.id === repoId);
            if (!repoMeta) {
                res.status(404).json({ success: false, error: 'Repository not found' });
                return;
            }
            const localPath = repoMeta.localPath;
            if (!localPath) {
                res.status(400).json({ success: false, error: 'Repository not ready (no local path)' });
                return;
            }
            const { runAudit } = await import('../../services/audit/AuditEngine');
            const report = await runAudit({ repoId, repoPath: localPath, skipParsers });
            res.json({ success: true, data: report });
        }
        catch (error) {
            Logger.error('[API] Audit error:', error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Audit failed',
            });
        }
    });
    return router;
}
export default createCodeReviewRouter;
//# sourceMappingURL=codeReviewRoutes.js.map