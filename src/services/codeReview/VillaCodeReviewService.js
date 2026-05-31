/**
 * Villa Code Review Service for Cline V2
 *
 * Integrates Villa's validation engine with Cline's architecture
 * for web-based code review functionality.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { buildApiHandler } from '../../core/api';
import { Logger } from '../../shared/services/Logger';
export class VillaCodeReviewService {
    controller;
    stateManager;
    cacheDir;
    constructor(controller, stateManager) {
        this.controller = controller;
        this.stateManager = stateManager;
        this.cacheDir = path.join(process.cwd(), '.villa-cache');
    }
    /**
     * Review a single file with AI-powered analysis
     */
    async reviewFile(options) {
        const startTime = Date.now();
        const { content, fileName, language, preferences, skipCache } = options;
        Logger.info(`[VillaCodeReview] Starting review for: ${fileName}`);
        Logger.info(`[VillaCodeReview] Content length: ${content.length} chars`);
        Logger.info(`[VillaCodeReview] Skip cache: ${skipCache}`);
        // Check cache
        if (!skipCache) {
            Logger.info('[VillaCodeReview] Checking cache...');
            const cached = await this.getCachedReview(fileName, content);
            if (cached) {
                Logger.info(`[VillaCodeReview] ✓ Cache hit! Returning cached result with ${cached.issues.length} issues`);
                return {
                    ...cached,
                    metadata: {
                        ...cached.metadata,
                        cached: true,
                        duration: Date.now() - startTime,
                    },
                };
            }
            Logger.info('[VillaCodeReview] ✗ Cache miss - proceeding with AI review');
        }
        // Use Cline's AI to analyze code
        const detectedLanguage = language || this.detectLanguage(fileName);
        Logger.info(`[VillaCodeReview] Detected language: ${detectedLanguage}`);
        Logger.info('[VillaCodeReview] Initializing AI API handler...');
        // Get API configuration from state manager
        const apiConfig = this.stateManager.getApiConfiguration();
        if (!apiConfig.apiKey) {
            Logger.error('[VillaCodeReview] No API key configured! Please set API key in settings.');
            throw new Error('No API key configured. Please add your API key in the settings at /api/state.');
        }
        Logger.info(`[VillaCodeReview] Using API key: ${apiConfig.apiKey.substring(0, 10)}...`);
        const apiHandler = buildApiHandler(apiConfig, 'act');
        Logger.info('[VillaCodeReview] ✓ API handler ready');
        const systemPrompt = `You are a code reviewer. Analyze the provided code and identify issues.
Return a JSON array of issues with this structure:
[{
  "message": "Issue description",
  "severity": "error|warning|info",
  "line": 1,
  "column": 1,
  "ruleId": "rule-name",
  "suggestedFix": {
    "description": "What to change",
    "replacement": "new code"
  }
}]`;
        const userPrompt = `Review this ${detectedLanguage} file:\n\n\`\`\`${detectedLanguage}\n${content}\n\`\`\``;
        try {
            Logger.info('[VillaCodeReview] Sending request to AI...');
            Logger.info(`[VillaCodeReview] Provider: ${apiConfig.actModeApiProvider || 'default'}`);
            const stream = apiHandler.createMessage(systemPrompt, [{ role: 'user', content: userPrompt }]);
            // Collect stream chunks
            let fullResponse = '';
            try {
                for await (const chunk of stream) {
                    if (chunk.type === 'text' && chunk.text) {
                        fullResponse += chunk.text;
                    }
                }
            }
            catch (streamError) {
                Logger.error('[VillaCodeReview] ✗ Stream error:', streamError);
                let errorMessage = 'AI API request failed';
                if (streamError.message?.includes('401') || streamError.message?.includes('unauthorized')) {
                    errorMessage = 'Invalid API key. Please check your API key in Settings.';
                }
                else if (streamError.message?.includes('429') || streamError.message?.includes('rate limit')) {
                    errorMessage = 'Rate limit exceeded. Please try again later.';
                }
                else if (streamError.message?.includes('404') || streamError.message?.includes('not found')) {
                    errorMessage = 'API endpoint not found. Check your provider/model configuration.';
                }
                else if (streamError.message?.includes('ENOTFOUND') || streamError.message?.includes('ECONNREFUSED')) {
                    errorMessage = 'Network error. Cannot connect to AI API.';
                }
                else if (streamError.message) {
                    errorMessage = `API Error: ${streamError.message}`;
                }
                throw new Error(errorMessage);
            }
            Logger.info(`[VillaCodeReview] ✓ Received AI response (${fullResponse.length} chars)`);
            Logger.info(`[VillaCodeReview] Response preview: ${fullResponse.substring(0, 200)}...`);
            let issues = [];
            // Parse AI response
            Logger.info('[VillaCodeReview] Parsing AI response...');
            try {
                const parsed = JSON.parse(fullResponse);
                issues = Array.isArray(parsed) ? parsed : parsed.issues || [];
                Logger.info(`[VillaCodeReview] ✓ Parsed ${issues.length} issues from JSON`);
            }
            catch (e) {
                Logger.warn('[VillaCodeReview] Failed to parse JSON directly, trying markdown extraction...');
                // Try to extract JSON from markdown
                const jsonMatch = fullResponse.match(/```json\n([\s\S]*?)\n```/);
                if (jsonMatch) {
                    issues = JSON.parse(jsonMatch[1]);
                    Logger.info(`[VillaCodeReview] ✓ Extracted ${issues.length} issues from markdown`);
                }
                else {
                    Logger.warn('[VillaCodeReview] ✗ No JSON found in response');
                    Logger.warn(`[VillaCodeReview] Full response: ${fullResponse}`);
                }
            }
            // Normalize issues
            Logger.info('[VillaCodeReview] Normalizing issues...');
            issues = issues.map((issue, index) => ({
                ...issue,
                id: `issue_${index}_${Date.now()}`,
                severity: issue.severity || 'warning',
                line: issue.line || 1,
                column: issue.column || 1,
                ruleId: issue.ruleId || 'general',
                source: issue.source || 'ai',
            }));
            // Drop no-op issues: when the AI's `suggestedFix.replacement` already exists in the file
            // (either as the literal `issue.code` field it returned, or as the trimmed line at
            // `issue.line`), the "fix" is a string-for-string identity. Applying it would burn LLM
            // tokens to produce a zero-byte diff and confuse users with "AI did not modify the file".
            // Filter these out at the source instead of letting them reach the issues list.
            const fileLines = content.split(/\r?\n/);
            const beforeFilter = issues.length;
            issues = issues.filter((issue) => {
                const replacement = issue.suggestedFix?.replacement;
                if (typeof replacement !== 'string' || replacement.length === 0)
                    return true;
                const replacementNorm = replacement.trim();
                // `code` is an undeclared-but-real field some AI providers attach to the issue payload.
                // Cast through unknown to read it defensively without widening the public interface.
                const issueCode = issue.code;
                if (typeof issueCode === 'string' && issueCode.trim() === replacementNorm) {
                    Logger.info(`[VillaCodeReview] Dropping no-op issue (code === replacement): ${issue.ruleId} L${issue.line}`);
                    return false;
                }
                const lineIdx = (issue.line ?? 1) - 1;
                if (lineIdx >= 0 && lineIdx < fileLines.length && fileLines[lineIdx].trim() === replacementNorm) {
                    Logger.info(`[VillaCodeReview] Dropping no-op issue (line ${issue.line} already matches): ${issue.ruleId}`);
                    return false;
                }
                return true;
            });
            if (issues.length !== beforeFilter) {
                Logger.info(`[VillaCodeReview] Filtered ${beforeFilter - issues.length} no-op issue(s)`);
            }
            // Apply max issues limit
            const maxIssues = preferences?.maxIssues || 100;
            if (issues.length > maxIssues) {
                Logger.info(`[VillaCodeReview] Truncating from ${issues.length} to ${maxIssues} issues`);
                issues = issues.slice(0, maxIssues);
            }
            // Calculate summary
            const summary = {
                total: issues.length,
                errors: issues.filter(i => i.severity === 'error').length,
                warnings: issues.filter(i => i.severity === 'warning').length,
                info: issues.filter(i => i.severity === 'info' || i.severity === 'hint').length,
            };
            Logger.info(`[VillaCodeReview] Summary: ${summary.total} total (${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} info)`);
            const result = {
                issues,
                summary,
                metadata: {
                    fileName,
                    language: detectedLanguage,
                    duration: Date.now() - startTime,
                    cached: false,
                    timestamp: new Date().toISOString(),
                },
            };
            // Cache result
            if (!skipCache) {
                Logger.info('[VillaCodeReview] Caching result...');
                await this.cacheReview(fileName, content, result);
                Logger.info('[VillaCodeReview] ✓ Result cached');
            }
            Logger.info(`[VillaCodeReview] ✓ Review complete in ${result.metadata.duration}ms`);
            return result;
        }
        catch (error) {
            Logger.error('[VillaCodeReview] ✗ Code review failed:', error);
            return {
                issues: [],
                summary: { total: 0, errors: 0, warnings: 0, info: 0 },
                metadata: {
                    fileName,
                    language: detectedLanguage,
                    duration: Date.now() - startTime,
                    cached: false,
                    timestamp: new Date().toISOString(),
                },
            };
        }
    }
    /**
     * Scan entire repository for issues
     */
    async scanRepository(options) {
        const startTime = Date.now();
        const { repoPath, filePatterns, maxFiles = 50, maxFileSize = 250000, excludePatterns } = options;
        Logger.info(`[VillaCodeReview] Starting repository scan: ${repoPath}`);
        Logger.info(`[VillaCodeReview] Max files: ${maxFiles}, Max size: ${maxFileSize}`);
        // Find all files
        Logger.info('[VillaCodeReview] Finding files...');
        const files = await this.findFiles(repoPath, filePatterns, excludePatterns);
        Logger.info(`[VillaCodeReview] Found ${files.length} files, limiting to ${maxFiles}`);
        const limitedFiles = files.slice(0, maxFiles);
        // Review each file
        const results = [];
        let totalIssues = 0;
        let totalErrors = 0;
        let totalWarnings = 0;
        Logger.info(`[VillaCodeReview] Starting review of ${limitedFiles.length} files...`);
        for (let i = 0; i < limitedFiles.length; i++) {
            const filePath = limitedFiles[i];
            Logger.info(`[VillaCodeReview] [${i + 1}/${limitedFiles.length}] Reviewing: ${path.basename(filePath)}`);
            try {
                const stat = await fs.stat(filePath);
                if (stat.size > maxFileSize) {
                    Logger.warn(`[VillaCodeReview] Skipping ${filePath} - too large (${stat.size} bytes)`);
                    continue;
                }
                const content = await fs.readFile(filePath, 'utf-8');
                const relPath = path.relative(repoPath, filePath);
                const detectedLanguage = this.detectLanguage(relPath);
                if (this.isEffectivelyOnlyCommentsOrWhitespace(content, detectedLanguage)) {
                    Logger.info(`[VillaCodeReview] Skipping ${relPath} - comments/whitespace only`);
                    continue;
                }
                Logger.info(`[VillaCodeReview] File size: ${content.length} chars`);
                const review = await this.reviewFile({
                    content,
                    fileName: relPath,
                    language: detectedLanguage,
                    preferences: { maxIssues: 20 },
                });
                results.push({
                    path: relPath,
                    language: review.metadata.language,
                    size: stat.size,
                    issues: review.issues,
                });
                totalIssues += review.summary.total;
                totalErrors += review.summary.errors;
                totalWarnings += review.summary.warnings;
                Logger.info(`[VillaCodeReview] ✓ Found ${review.summary.total} issues in ${relPath}`);
            }
            catch (error) {
                Logger.error(`[VillaCodeReview] ✗ Failed to review ${filePath}:`, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                // Surface API errors immediately - don't silently continue
                if (errorMessage.includes('API') ||
                    errorMessage.includes('key') ||
                    errorMessage.includes('unauthorized') ||
                    errorMessage.includes('401') ||
                    errorMessage.includes('404') ||
                    errorMessage.includes('429')) {
                    Logger.error('[VillaCodeReview] ✗ API error - stopping scan');
                    throw new Error(`AI Validation Failed: ${errorMessage}`);
                }
                // For non-API errors, add empty result and continue
                Logger.warn(`[VillaCodeReview] Skipping file due to error: ${errorMessage}`);
                results.push({
                    path: path.relative(repoPath, filePath),
                    language: path.extname(filePath).slice(1) || 'unknown',
                    size: 0,
                    issues: [],
                });
            }
        }
        const scanDuration = Date.now() - startTime;
        Logger.info(`[VillaCodeReview] ✓ Scan complete: ${results.length} files, ${totalIssues} issues, ${scanDuration}ms`);
        return {
            files: results,
            summary: {
                totalFiles: results.length,
                totalIssues,
                errors: totalErrors,
                warnings: totalWarnings,
            },
            scanDuration,
        };
    }
    /**
     * Apply AI-suggested fix to file
     */
    async applyFix(filePath, fix) {
        if (!fix) {
            Logger.warn('[VillaCodeReview] No fix provided');
            return false;
        }
        const start = fix?.range?.start;
        const end = fix?.range?.end;
        if (typeof start !== "number" || typeof end !== "number") {
            Logger.warn("[VillaCodeReview] Invalid fix provided (missing range.start/range.end)");
            return false;
        }
        Logger.info(`[VillaCodeReview] Applying fix to: ${filePath}`);
        Logger.info(`[VillaCodeReview] Fix range: ${start}-${end}`);
        Logger.info(`[VillaCodeReview] Fix description: ${fix.description}`);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            Logger.info(`[VillaCodeReview] Original file size: ${content.length} chars`);
            // Apply fix
            const before = content.slice(0, start);
            const after = content.slice(end);
            const newContent = before + fix.replacement + after;
            Logger.info(`[VillaCodeReview] New file size: ${newContent.length} chars`);
            await fs.writeFile(filePath, newContent, 'utf-8');
            Logger.info('[VillaCodeReview] ✓ File written successfully');
            // Invalidate cache
            Logger.info('[VillaCodeReview] Invalidating cache...');
            await this.invalidateCache(filePath);
            Logger.info('[VillaCodeReview] ✓ Cache invalidated');
            return true;
        }
        catch (error) {
            Logger.error(`[VillaCodeReview] ✗ Failed to apply fix to ${filePath}:`, error);
            return false;
        }
    }
    /**
     * Get cached review result
     */
    async getCachedReview(fileName, content) {
        try {
            const hash = this.hashContent(content);
            const cachePath = path.join(this.cacheDir, `${hash}.json`);
            Logger.info(`[VillaCodeReview] Cache check - hash: ${hash}, path: ${cachePath}`);
            const data = await fs.readFile(cachePath, 'utf-8');
            const cached = JSON.parse(data);
            // Check if result is still valid (TTL: 1 hour)
            const cacheTime = new Date(cached.metadata.timestamp).getTime();
            const age = Date.now() - cacheTime;
            Logger.info(`[VillaCodeReview] Cache age: ${age}ms (${Math.round(age / 1000)}s)`);
            if (age > 3600000) {
                Logger.info('[VillaCodeReview] Cache expired (older than 1 hour)');
                return null;
            }
            Logger.info(`[VillaCodeReview] ✓ Valid cache found with ${cached.issues.length} issues`);
            return cached;
        }
        catch (error) {
            // No cache entry or invalid
            return null;
        }
    }
    /**
     * Cache review result
     */
    async cacheReview(fileName, content, result) {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            const hash = this.hashContent(content);
            const cachePath = path.join(this.cacheDir, `${hash}.json`);
            Logger.info(`[VillaCodeReview] Writing cache: ${cachePath}`);
            await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
            Logger.info(`[VillaCodeReview] ✓ Cached ${result.issues.length} issues`);
        }
        catch (error) {
            Logger.error('[VillaCodeReview] Failed to cache review:', error);
        }
    }
    /**
     * Invalidate cache for file
     */
    async invalidateCache(filePath) {
        // Find and remove matching cache entries
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                const cachePath = path.join(this.cacheDir, file);
                try {
                    const data = await fs.readFile(cachePath, 'utf-8');
                    const cached = JSON.parse(data);
                    if (cached.metadata?.fileName === filePath) {
                        await fs.unlink(cachePath);
                    }
                }
                catch {
                    // Ignore invalid cache entries
                }
            }
        }
        catch {
            // Directory might not exist
        }
    }
    /**
     * Find files in repository matching patterns
     */
    async findFiles(repoPath, patterns, excludePatterns) {
        const files = [];
        const defaultExtensions = new Set([
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".mjs",
            ".cjs",
            ".py",
            ".go",
            ".rs",
            ".java",
            ".kt",
            ".cs",
            ".cpp",
            ".cc",
            ".c",
            ".h",
            ".hpp",
            ".php",
            ".rb",
            ".swift",
            ".sh",
            ".ps1",
            ".sql",
        ]);
        const searchPatterns = patterns?.length ? patterns : undefined;
        const normalizedExcludePatterns = excludePatterns?.map((p) => p.replace(/\\/g, "/"));
        const isHardExcluded = (fullPath) => {
            const p = fullPath.replace(/\\/g, "/");
            const base = path.basename(p).toLowerCase();
            const excludedDirs = [
                "/node_modules/",
                "/.git/",
                "/dist/",
                "/build/",
                "/out/",
                "/coverage/",
                "/.next/",
                "/.nuxt/",
                "/.turbo/",
                "/.cache/",
                "/vendor/",
                "/target/",
                "/bin/",
                "/obj/",
                "/Pods/",
            ];
            if (excludedDirs.some((d) => p.includes(d)))
                return true;
            const excludedBasenames = new Set([
                "dockerfile",
                "docker-compose.yml",
                "docker-compose.yaml",
                "package-lock.json",
                "yarn.lock",
                "pnpm-lock.yaml",
                "bun.lockb",
                "cargo.lock",
                "poetry.lock",
                "pipfile.lock",
                "composer.lock",
                "go.sum",
                "go.mod",
            ]);
            if (excludedBasenames.has(base))
                return true;
            const ext = path.extname(base);
            const excludedExtensions = new Set([
                ".map",
                ".min.js",
                ".min.css",
                ".lock",
                ".log",
                ".png",
                ".jpg",
                ".jpeg",
                ".gif",
                ".webp",
                ".svg",
                ".ico",
                ".pdf",
                ".zip",
                ".tar",
                ".gz",
                ".7z",
            ]);
            if (excludedExtensions.has(ext))
                return true;
            return false;
        };
        const matchesPatterns = (fullPath) => {
            const normalizedFullPath = fullPath.replace(/\\/g, "/");
            if (isHardExcluded(normalizedFullPath))
                return false;
            if (!searchPatterns) {
                const ext = path.extname(fullPath).toLowerCase();
                return defaultExtensions.has(ext);
            }
            return searchPatterns.some((pattern) => {
                const normalizedPattern = pattern.replace(/\\/g, "/");
                if (normalizedPattern.includes("*")) {
                    // glob -> regex (works on normalized '/' paths)
                    const regexPattern = normalizedPattern
                        .replace(/\./g, "\\.")
                        .replace(/\*\*/g, "___GLOBSTAR___")
                        .replace(/\*/g, "[^/]*")
                        .replace(/___GLOBSTAR___/g, ".*");
                    const regex = new RegExp(regexPattern + "$", "i");
                    return regex.test(normalizedFullPath);
                }
                return normalizedFullPath.includes(normalizedPattern);
            });
        };
        const isExcluded = (fullPath) => {
            if (!normalizedExcludePatterns?.length)
                return false;
            const normalizedFullPath = fullPath.replace(/\\/g, "/");
            return normalizedExcludePatterns.some((p) => normalizedFullPath.includes(p));
        };
        const walk = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith("."))
                    continue;
                if (entry.name === "node_modules")
                    continue;
                const fullPath = path.join(dir, entry.name);
                if (isHardExcluded(fullPath))
                    continue;
                if (isExcluded(fullPath))
                    continue;
                if (entry.isDirectory()) {
                    await walk(fullPath);
                    continue;
                }
                if (entry.isFile() && matchesPatterns(fullPath)) {
                    files.push(fullPath);
                }
            }
        };
        await walk(repoPath);
        Logger.info(`[VillaCodeReview] File discovery complete: ${files.length} matched files`);
        if (files.length > 0) {
            Logger.info(`[VillaCodeReview] Sample matched files: ${files
                .slice(0, 10)
                .map((f) => path.relative(repoPath, f))
                .join(", ")}`);
        }
        return files;
    }
    isEffectivelyOnlyCommentsOrWhitespace(content, language) {
        const trimmed = content.trim();
        if (!trimmed)
            return true;
        const lang = (language || "").toLowerCase();
        // Remove block comments for common C-style languages
        let withoutBlock = trimmed;
        if (["typescript", "javascript", "java", "c", "cpp", "csharp", "php", "swift", "kotlin", "go", "rust"].includes(lang)) {
            withoutBlock = withoutBlock.replace(/\/\*[\s\S]*?\*\//g, "");
        }
        // Remove line comments
        let withoutLine = withoutBlock;
        if (["typescript", "javascript", "java", "c", "cpp", "csharp", "php", "swift", "kotlin", "go", "rust"].includes(lang)) {
            withoutLine = withoutLine.replace(/^\s*\/\/.*$/gm, "");
        }
        else if (lang === "python" || lang === "ruby" || lang === "shell" || lang === "powershell") {
            withoutLine = withoutLine.replace(/^\s*#.*$/gm, "");
        }
        else if (lang === "sql") {
            withoutLine = withoutLine.replace(/^\s*--.*$/gm, "");
        }
        const remaining = withoutLine.replace(/\s+/g, "");
        return remaining.length < 20;
    }
    /**
     * Detect language from filename
     */
    detectLanguage(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        const langMap = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.mjs': 'javascript',
            '.cjs': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.php': 'php',
            '.rb': 'ruby',
            '.swift': 'swift',
            '.kt': 'kotlin',
        };
        return langMap[ext] || 'unknown';
    }
    /**
     * Hash content for caching
     */
    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    }
}
export default VillaCodeReviewService;
//# sourceMappingURL=VillaCodeReviewService.js.map