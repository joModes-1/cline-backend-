/**
 * Repository Manager for Villa Code Review
 * 
 * Handles GitHub repository downloading and zip file extraction
 * for web-based code review.
 * 
 * NOTE: This is a WEB APP backend, not a VSCode extension.
 * Repository metadata is stored in MongoDB (User.repositories), NOT in memory.
 * Files are stored on disk at .villa-repos/{repoId}/
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import { Logger } from '../../shared/services/Logger';

const execAsync = promisify(exec);

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  branch?: string;
  token?: string;
}

export interface Repository {
  id: string;
  name: string;
  source: 'github' | 'zip';
  githubUrl?: string;
  localPath: string;
  createdAt: Date;
  status: 'cloning' | 'ready' | 'error';
  error?: string;
  // User association
  userId?: string;
}

export interface RepoMetadata {
  id: string;
  name: string;
  url: string;
  owner: string;
  repo: string;
  branch: string;
  createdAt: Date;
  localPath: string;
  status: 'cloning' | 'ready' | 'error';
}

export class RepositoryManager {
  private reposDir: string;

  constructor(baseDir?: string) {
    this.reposDir = baseDir || path.join(process.cwd(), '.villa-repos');
    // Ensure repos directory exists
    fs.mkdir(this.reposDir, { recursive: true }).catch(() => {});
  }

  /**
   * Move directory contents recursively preserving structure
   */
  private async moveDirectoryContents(srcDir: string, destDir: string): Promise<void> {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.moveDirectoryContents(srcPath, destPath);
        await fs.rmdir(srcPath);
      } else {
        await fs.rename(srcPath, destPath);
      }
    }
  }

	/**
	 * If a repository root contains a single top-level directory, move its contents to the root.
	 * This matches GitHub zip behavior and helps with uploaded zips that wrap contents.
	 */
	async flattenSingleTopLevelFolder(repoRoot: string): Promise<void> {
		try {
			const extractedItems = await fs.readdir(repoRoot)
			if (extractedItems.length !== 1) return

			const subDir = path.join(repoRoot, extractedItems[0])
			const stat = await fs.stat(subDir)
			if (!stat.isDirectory()) return

			Logger.info(`[RepositoryManager] Flattening top-level folder: ${extractedItems[0]}`)
			await this.moveDirectoryContents(subDir, repoRoot)
			await fs.rmdir(subDir)
		} catch {
			// ignore
		}
	}

  /**
   * Download a GitHub repository as zip and extract it
   * Returns Repository with localPath for file operations
   */
  async cloneGitHubRepo(repoInfo: GitHubRepoInfo): Promise<Repository> {
    const { owner, repo, branch = 'main', token } = repoInfo;
    const repoId = `${owner}_${repo}_${Date.now()}`;
    const localPath = path.join(this.reposDir, repoId);

    Logger.info(`[RepositoryManager] Starting GitHub download: ${owner}/${repo} (branch: ${branch})`);
    Logger.info(`[RepositoryManager] Repo ID: ${repoId}`);
    Logger.info(`[RepositoryManager] Local path: ${localPath}`);

    const repository: Repository = {
      id: repoId,
      name: `${owner}/${repo}`,
      source: 'github',
      githubUrl: `https://github.com/${owner}/${repo}`,
      localPath,
      createdAt: new Date(),
      status: 'cloning',
    };

    try {
      await fs.mkdir(this.reposDir, { recursive: true });

      // Download zip from GitHub
      const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
      Logger.info(`[RepositoryManager] Downloading from: ${zipUrl}`);
      
      const headers: Record<string, string> = {
        'User-Agent': 'Villa-Code-Review/1.0'
      };
      
      if (token) {
        Logger.info('[RepositoryManager] Using authenticated download');
        headers['Authorization'] = `token ${token}`;
      }

      const response = await fetch(zipUrl, { headers });
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Repository not found: ${owner}/${repo} (branch: ${branch}). Check the URL and branch name.`);
        }
        throw new Error(`Failed to download: HTTP ${response.status} - ${response.statusText}`);
      }

      const zipBuffer = Buffer.from(await response.arrayBuffer());
      Logger.info(`[RepositoryManager] Downloaded ${zipBuffer.length} bytes`);

      // Save zip file temporarily
      const zipPath = path.join(this.reposDir, `${repoId}.zip`);
      await fs.writeFile(zipPath, zipBuffer);

      // Extract zip
      if (process.platform === 'win32') {
        await execAsync(
          `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${localPath}' -Force"`,
          { timeout: 60000 }
        );
      } else {
        await fs.mkdir(localPath, { recursive: true });
        await execAsync(
          `unzip -q "${zipPath}" -d "${localPath}"`,
          { timeout: 60000 }
        );
      }

      // Clean up zip file
      await fs.unlink(zipPath);

      // GitHub zip extracts at a subfolder like "repo-branch/"
      // Move all files from subfolder to root preserving structure
      const extractedItems = await fs.readdir(localPath);
      if (extractedItems.length === 1) {
        const subDir = path.join(localPath, extractedItems[0]);
        const stat = await fs.stat(subDir);
        if (stat.isDirectory()) {
          Logger.info(`[RepositoryManager] Moving files from subfolder: ${extractedItems[0]}`);
          await this.moveDirectoryContents(subDir, localPath);
          await fs.rmdir(subDir);
        }
      }

      repository.status = 'ready';
      Logger.info(`[RepositoryManager] Repository downloaded successfully: ${repoId}`);
      
      return repository;
    } catch (error) {
      repository.status = 'error';
      repository.error = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`[RepositoryManager] Failed to download repository: ${repoId}`, error);
      throw error;
    }
  }

  /**
   * Extract uploaded zip file
   */
  async extractZipFile(zipBuffer: Buffer, originalName: string): Promise<Repository> {
    const repoId = `zip_${crypto.randomBytes(8).toString('hex')}_${Date.now()}`;
    const localPath = path.join(this.reposDir, repoId);

    Logger.info(`[RepositoryManager] Starting zip extraction: ${originalName}`);
    Logger.info(`[RepositoryManager] Repo ID: ${repoId}`);

    const repository: Repository = {
      id: repoId,
      name: originalName.replace('.zip', ''),
      source: 'zip',
      localPath,
      createdAt: new Date(),
      status: 'cloning',
    };

    try {
      await fs.mkdir(this.reposDir, { recursive: true });

      // Save zip file temporarily
      const zipPath = path.join(this.reposDir, `${repoId}.zip`);
      await fs.writeFile(zipPath, zipBuffer);

      // Extract zip
      if (process.platform === 'win32') {
        await execAsync(
          `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${localPath}' -Force"`,
          { timeout: 60000 }
        );
      } else {
        await fs.mkdir(localPath, { recursive: true });
        await execAsync(
          `unzip -q "${zipPath}" -d "${localPath}"`,
          { timeout: 60000 }
        );
      }

      // Clean up zip file
      await fs.unlink(zipPath);

			await this.flattenSingleTopLevelFolder(localPath)

      repository.status = 'ready';
      Logger.info(`[RepositoryManager] Zip extracted successfully: ${repoId}`);
      
      return repository;
    } catch (error) {
      repository.status = 'error';
      repository.error = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`[RepositoryManager] Failed to extract zip: ${repoId}`, error);
      throw error;
    }
  }

  /**
   * Get repository by ID - checks if files exist on disk
   * NOTE: Metadata is stored in MongoDB User.repositories, not here
   */
  async getRepository(repoId: string, localPath?: string): Promise<Repository | null> {
    Logger.info(`[RepositoryManager] Getting repository: ${repoId}`);
    
    // If localPath provided, check if it exists
    const repoPath = localPath || path.join(this.reposDir, repoId);
    
    try {
      await fs.access(repoPath);
      Logger.info(`[RepositoryManager] Found repository on disk: ${repoId}`);
      return {
        id: repoId,
        name: repoId,
        source: 'github',
        localPath: repoPath,
        createdAt: new Date(),
        status: 'ready',
      };
    } catch {
      Logger.warn(`[RepositoryManager] Repository not found on disk: ${repoId}`);
      return null;
    }
  }

  /**
   * Delete repository files from disk
   * NOTE: Metadata deletion happens in MongoDB User.repositories
   */
  async deleteRepository(localPath: string): Promise<boolean> {
    Logger.info(`[RepositoryManager] Deleting repository files: ${localPath}`);
    
    try {
      await fs.rm(localPath, { recursive: true, force: true });
      Logger.info(`[RepositoryManager] Repository files deleted: ${localPath}`);
      return true;
    } catch (error) {
      Logger.error(`[RepositoryManager] Failed to delete repository: ${localPath}`, error);
      return false;
    }
  }

  /**
   * Scan repository for code files
   */
  async scanRepository(localPath: string): Promise<string[]> {
    Logger.info(`[RepositoryManager] Scanning repository: ${localPath}`);
    
    const files: string[] = [];
    const codeExtensions = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.java', '.go', '.rs', '.cpp', '.c',
      '.cs', '.php', '.rb', '.swift', '.kt'
    ]);

    const walk = async (dir: string, repoPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(repoPath, fullPath);

          // Skip hidden, node_modules, etc.
          if (entry.name.startsWith('.')) continue;
          if (entry.name === 'node_modules') continue;
          if (entry.name === 'dist') continue;
          if (entry.name === 'build') continue;

          if (entry.isDirectory()) {
            await walk(fullPath, repoPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (codeExtensions.has(ext)) {
              files.push(relPath);
            }
          }
        }
      } catch {
        // Directory may not exist
      }
    };

    await walk(localPath, localPath);
    Logger.info(`[RepositoryManager] Scan complete: ${files.length} files found`);
    return files;
  }

  /**
   * List all files in repository for UI display.
   * This is intentionally less restrictive than scanRepository(), which is for validation.
   */
  async listAllFiles(localPath: string): Promise<string[]> {
    Logger.info(`[RepositoryManager] Listing all repository files: ${localPath}`)

    try {
      await fs.access(localPath)
    } catch (e) {
      Logger.warn(`[RepositoryManager] Repo path not accessible: ${localPath}`, e as Error)
      return []
    }

    await this.flattenSingleTopLevelFolder(localPath)

    const files: string[] = []

    const walk = async (dir: string, repoPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const relPath = path.relative(repoPath, fullPath)

          // Always skip git + common dependency folders
          if (entry.name === ".git") continue
          if (entry.name === "node_modules") continue

          if (entry.isDirectory()) {
            await walk(fullPath, repoPath)
          } else if (entry.isFile()) {
            files.push(relPath.replace(/\\/g, "/"))
          }
        }
      } catch {
        Logger.warn(`[RepositoryManager] Failed to read directory: ${dir}`)
      }
    }

    await walk(localPath, localPath)
    files.sort()
    Logger.info(`[RepositoryManager] List all complete: ${files.length} files found`)
    return files
  }

  /**
   * Get file content from repository
   */
  async getFileContent(localPath: string, filePath: string): Promise<string> {
    Logger.info(`[RepositoryManager] Reading file: ${filePath}`);
    
    const fullPath = path.join(localPath, filePath);
    
    // Security check - ensure file is within repo
    if (!fullPath.startsWith(localPath)) {
      Logger.error(`[RepositoryManager] Invalid file path (security): ${filePath}`);
      throw new Error('Invalid file path');
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    Logger.info(`[RepositoryManager] Read ${content.length} chars from ${filePath}`);
    return content;
  }

  /**
   * Write file content to repository
   */
  async writeFileContent(localPath: string, filePath: string, content: string): Promise<void> {
    Logger.info(`[RepositoryManager] Writing file: ${filePath}`);
    
    const fullPath = path.join(localPath, filePath);
    
    // Security check - ensure file is within repo
    if (!fullPath.startsWith(localPath)) {
      Logger.error(`[RepositoryManager] Invalid file path (security): ${filePath}`);
      throw new Error('Invalid file path');
    }

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(fullPath, content, 'utf-8');
    Logger.info(`[RepositoryManager] File written: ${filePath}`);
  }

  /**
   * Get repository stats
   */
  async getRepositoryStats(localPath: string): Promise<{
    totalFiles: number;
    totalLines: number;
    languages: Record<string, number>;
  }> {
    const files = await this.listAllFiles(localPath)
    const languages: Record<string, number> = {}
    let totalLines = 0

    const lineCountExtensions = new Set([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".cpp",
      ".cc",
      ".c",
      ".h",
      ".hpp",
      ".cs",
      ".php",
      ".rb",
      ".swift",
      ".kt",
      ".json",
      ".yml",
      ".yaml",
      ".toml",
      ".md",
      ".css",
      ".scss",
      ".html",
      ".sh",
      ".ps1",
      ".sql",
    ])

    for (const file of files) {
      const ext = path.extname(file).toLowerCase()
      languages[ext || "(no_ext)"] = (languages[ext || "(no_ext)"] || 0) + 1

      if (!lineCountExtensions.has(ext)) continue

      try {
        const content = await this.getFileContent(localPath, file)
        totalLines += content.split("\n").length
      } catch {
        // Ignore unreadable files
      }
    }

    return {
      totalFiles: files.length,
      totalLines,
      languages,
    }
  }
}

export default RepositoryManager;
