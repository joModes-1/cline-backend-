#!/usr/bin/env node
/**
 * Villa Backend Server - Minimal Cline Integration
 *
 * Single Express server with Cline's core components (StateManager, Controller)
 * for task management via REST API.
 */

// Load .env BEFORE any other import. We resolve the .env path relative to
// THIS file (cline-main/src/villa-server.ts → cline-main/.env) so the
// server reads the right .env regardless of where it was launched from
// (npm script, VS Code task, Docker, etc.). Without this, features gated
// on env vars (GitHub App pipeline, telemetry, etc.) silently stay off.
import * as dotenv from 'dotenv';
import { fileURLToPath as __toPath } from 'node:url';
import * as __nodePath from 'node:path';
const __envPath = __nodePath.resolve(__toPath(import.meta.url), '..', '..', '.env');
const __envResult = dotenv.config({ path: __envPath, quiet: true });
if (__envResult.error) {
  console.warn(`[INIT] .env load skipped (${__envPath}): ${__envResult.error.message}`);
} else {
  console.log(`[INIT] Loaded ${Object.keys(__envResult.parsed ?? {}).length} env var(s) from ${__envPath}`);
}

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import { createServer } from 'http';
import * as path from 'path';
import * as fs from 'fs/promises';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// Initialize HostProvider first (required by many core modules)
import { HostProvider } from './hosts/host-provider';
HostProvider.initialize();

import { ClineEndpoint } from "./config";

// Import core modules
import { StateManager } from './core/storage/StateManager';
import { Controller } from './core/controller';
import { Logger } from './shared/services/Logger';

// Pipe Cline's internal Logger to stdout/stderr so we can see scan, review, autofix, and tool activity.
// Without this subscriber, every Logger.info / Logger.error call is silently dropped.
Logger.subscribe((msg: string) => {
  const ts = new Date().toISOString();
  if (msg.startsWith('ERROR') || msg.startsWith('WARN')) {
    console.error(`[${ts}] ${msg}`);
  } else {
    console.log(`[${ts}] ${msg}`);
  }
});
import { createStorageContext } from './shared/storage/storage-context';
import { createCodeReviewRouter } from './core/controller/codeReviewRoutes';
import { createWorkspaceRouter } from './core/controller/workspaceRoutes';
import { WorkspaceExecutionService } from './services/workspace/WorkspaceExecutionService';
import { getSavedClineMessages } from './core/storage/disk';
import * as crypto from 'crypto';
import { RepositoryManager } from './services/codeReview/RepositoryManager';

// Import User model for MongoDB auth
import { User } from './models/User';

// Auth middleware interface
interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

// JWT Secret (must match web-ui server)
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production-to-64-char-random-string';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '-refresh';

const app = express();
// Render / Heroku / Railway / Fly all inject the bound port as PORT.
// Locally we use VILLA_PORT so it doesn't collide with the web-ui dev server's PORT.
const PORT = process.env.PORT || process.env.VILLA_PORT || 3004;
const HOST = process.env.VILLA_HOST || '0.0.0.0';

// Disable ETags so browsers can't revalidate and get 304 for API responses.
// This is important for the code editor which must always fetch fresh file content.
app.set('etag', false);

// MongoDB connection string from .env
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://jomodes765_db_user:passWORD4321@cluster0.rqel0rz.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = process.env.DB_NAME || 'villa_main';

const repoManager = new RepositoryManager();

async function countAllFiles(rootDir: string, dir: string = rootDir): Promise<number> {
  let count = 0;
  let entries: any[];

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countAllFiles(rootDir, fullPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }

  return count;
}

// Middleware
app.use(cors({ origin: '*', credentials: true }));
// express.json's `verify` callback runs with the RAW buffer BEFORE the body
// is parsed. We stash it on the request so the GitHub PR webhook handler
// can recompute the HMAC signature against the original bytes — JSON parsing
// is lossy (it re-stringifies, changing whitespace), so we'd never get the
// same HMAC back from the parsed object.
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = Buffer.isBuffer(buf) ? Buffer.from(buf) : buf;
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 },
  createParentPath: true,
  useTempFiles: true,
  tempFileDir: path.join(process.cwd(), '.villa-uploads'),
}));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    Logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Auth middleware
async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Get user from database
    const user = await User.findById(decoded.sub);
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email
    };
    
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
      return;
    }
    next(error);
  }
}
let stateManager: StateManager | null = null;
let controller: Controller | null = null;

// ============================================
// API Routes
// ============================================

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'villa-backend',
    initialized: !!controller,
    timestamp: new Date().toISOString(),
  });
});

// Get current state (protected)
app.get('/api/state', authenticate, (req: AuthRequest, res: Response) => {
  if (!stateManager) {
    res.status(503).json({ error: 'State manager not initialized' });
    return;
  }
  res.json({
    success: true,
    data: {
      apiConfiguration: stateManager.getApiConfiguration(),
      customInstructions: stateManager.getGlobalStateKey('customInstructions' as any),
    }
  });
});

// Update API configuration
app.post('/api/state/api-config', (req: Request, res: Response) => {
  if (!stateManager) {
    res.status(503).json({ error: 'State manager not initialized' });
    return;
  }
  try {
    stateManager.setApiConfiguration(req.body);
    res.json({ success: true, message: 'API configuration updated' });
  } catch (error) {
    Logger.error('Failed to update API config:', error);
    res.status(500).json({ success: false, error: 'Failed to update configuration' });
  }
});

// Update settings
app.post('/api/state/settings', (req: Request, res: Response) => {
  if (!stateManager) {
    res.status(503).json({ error: 'State manager not initialized' });
    return;
  }
  try {
    stateManager.setGlobalStateBatch(req.body);
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    Logger.error('Failed to update settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

// Create a new task
app.post('/api/tasks', async (req: Request, res: Response) => {
  if (!controller) {
    res.status(503).json({ error: 'Controller not initialized' });
    return;
  }
  const { message, images } = req.body;
  try {
    await controller.initTask(message, images);
    res.json({ success: true, message: 'Task created', taskId: controller.task?.ulid });
  } catch (error) {
    Logger.error('Failed to create task:', error);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

// Send message to current task
app.post('/api/tasks/message', async (req: Request, res: Response) => {
  if (!controller || !controller.task) {
    res.status(400).json({ error: 'No active task' });
    return;
  }
  const { message, images } = req.body;
  try {
    await controller.task.handleWebviewAskResponse('messageResponse', message || '', images || []);
    res.json({ success: true, message: 'Message sent' });
  } catch (error) {
    Logger.error('Failed to send message:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// Cancel current task
app.post('/api/tasks/cancel', async (_req: Request, res: Response) => {
  if (!controller) {
    res.status(503).json({ error: 'Controller not initialized' });
    return;
  }
  try {
    await controller.cancelTask();
    res.json({ success: true, message: 'Task cancelled' });
  } catch (error) {
    Logger.error('Failed to cancel task:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel task' });
  }
});

// Get task history
app.get('/api/tasks/history', (_req: Request, res: Response) => {
  if (!stateManager) {
    res.status(503).json({ error: 'State manager not initialized' });
    return;
  }
  const history = stateManager.getGlobalStateKey('taskHistory' as any) || [];
  res.json({ success: true, data: { history } });
});

// Get task messages (UI messages) for a specific taskId
app.get('/api/tasks/:taskId/messages', async (req: Request, res: Response) => {
	try {
		const taskId = String(req.params.taskId)
		const messages = await getSavedClineMessages(taskId)
		res.json({ success: true, data: { messages } })
	} catch (error) {
		Logger.error('Failed to get task messages:', error)
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : 'Failed to get task messages',
		})
	}
})

// Helper functions (use imported jwt library)
function generateToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function generateRefreshToken(payload: object): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '30d' });
}

function verifyRefreshToken(token: string): any {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch {
    return null;
  }
}

// Register with MongoDB
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password required' });
      return;
    }

    // Check if user exists in database
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'User already exists' });
      return;
    }

    // Create user in database
    const user = new User({
      email: email.toLowerCase(),
      password,
      name: name || email.split('@')[0],
      apiKeys: []
    });
    await user.save();

    // Generate tokens
    const token = generateToken({ 
      sub: user._id.toString(),
      userId: user._id.toString(), 
      email: user.email, 
      name: user.name 
    });
    const refreshToken = generateRefreshToken({
      sub: user._id.toString(),
      userId: user._id.toString()
    });

    res.status(201).json({ 
      success: true, 
      user: { 
        id: user._id.toString(), 
        email: user.email, 
        name: user.name 
      }, 
      token,
      refreshToken,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Login with MongoDB
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password required' });
      return;
    }

    // Find user in database
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Check password using bcrypt
    const isValid = await user.comparePassword(password);
    if (!isValid) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Generate tokens
    const token = generateToken({ 
      sub: user._id.toString(),
      userId: user._id.toString(), 
      email: user.email, 
      name: user.name 
    });
    const refreshToken = generateRefreshToken({
      sub: user._id.toString(),
      userId: user._id.toString()
    });

    res.json({ 
      success: true, 
      user: { 
        id: user._id.toString(), 
        email: user.email, 
        name: user.name,
        apiKeys: user.apiKeys
      }, 
      token,
      refreshToken,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Refresh token
app.post('/api/auth/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: { code: 'MISSING_REFRESH_TOKEN', message: 'Refresh token required' } });
      return;
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      res.status(401).json({ success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
      return;
    }
    
    // Get user from database
    const user = await User.findById(decoded.sub);
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      return;
    }

    // Generate new tokens
    const newToken = generateToken({ 
      sub: user._id.toString(),
      userId: user._id.toString(), 
      email: user.email, 
      name: user.name 
    });
    const newRefreshToken = generateRefreshToken({
      sub: user._id.toString(),
      userId: user._id.toString()
    });

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' } });
      return;
    }
    console.error('Refresh error:', error);
    res.status(500).json({ success: false, error: { code: 'REFRESH_FAILED', message: 'Token refresh failed' } });
  }
});

// Get profile (token verification stays the same)
app.get('/api/auth/profile', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    // Fetch fresh user data from database
    const user = await User.findById(payload.userId).select('-password');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({ 
      success: true, 
      user: { 
        id: user._id.toString(), 
        email: user.email, 
        name: user.name,
        apiKeys: user.apiKeys,
        repositories: user.repositories
      } 
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});

// Logout (client-side token removal, but we can add server-side token blacklist if needed)
app.post('/api/auth/logout', async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out' });
});

// Get user repositories
app.get('/api/auth/repos', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const user = await User.findById(payload.userId).select('repositories');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({ success: true, data: { repositories: user.repositories || [] } });
  } catch (error) {
    console.error('Get repos error:', error);
    res.status(500).json({ success: false, message: 'Failed to get repositories' });
  }
});

// Add repository to user
app.post('/api/auth/repos', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const { id, name, url, owner, repo, branch } = req.body;
    if (!id || !name || !url) {
      res.status(400).json({ success: false, message: 'Repository id, name, and url required' });
      return;
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Check if repo already exists
    const existingRepo = user.repositories.find(r => r.id === id);
    if (existingRepo) {
      res.status(409).json({ success: false, message: 'Repository already exists' });
      return;
    }

    // Add repository
    user.repositories.push({
      id,
      name,
      url,
      owner: owner || '',
      repo: repo || '',
      branch: branch || 'main',
      createdAt: new Date()
    });
    await user.save();

    res.status(201).json({ success: true, message: 'Repository added', data: { repository: user.repositories[user.repositories.length - 1] } });
  } catch (error) {
    console.error('Add repo error:', error);
    res.status(500).json({ success: false, message: 'Failed to add repository' });
  }
});

// Add API key to user
app.post('/api/auth/apikeys', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided' });
      return;
    }
    const token = authHeader.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    const { apiKey } = req.body;
    if (!apiKey) {
      res.status(400).json({ success: false, message: 'API key required' });
      return;
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Add API key if not exists
    if (!user.apiKeys.includes(apiKey)) {
      user.apiKeys.push(apiKey);
      await user.save();
    }

    res.json({ success: true, message: 'API key added', data: { apiKeys: user.apiKeys } });
    return;
  } catch (error) {
    console.error('Add API key error:', error);
    res.status(500).json({ success: false, message: 'Failed to add API key' });
    return;
  }
});

app.get('/api/auth/providers', (_req: Request, res: Response) => {
  res.json({ success: true, data: { providers: { google: false, github: false, email: true }, hasOAuth: false, requiresEmailAuth: true }});
});

// ============================================
// User Repository Persistence Routes (/api/user/repos)
// ============================================

// GET /api/user/repos - Get user's repositories
app.get('/api/user/repos', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' }});
    }
    // Map 'id' field to 'repoId' for frontend compatibility
    // Default source to 'github' for existing repos without source
    // Parse owner/repo from repoId if missing (format: {owner}_{repo}_{timestamp})
    const repos = (user.repositories || []).map((r: any) => {
      let owner = r.owner;
      let repo = r.repo;
      
      // Parse from repoId if owner/repo missing
      if ((!owner || !repo) && r.id) {
        const parts = r.id.split('_');
        if (parts.length >= 3) {
          owner = owner || parts[0];
          repo = repo || parts.slice(1, -1).join('_');
        }
      }
      
      return {
        ...r.toObject?.() || r,
        repoId: r.id,
        owner,
        repo,
        source: r.source || 'github',
        isActive: r.isActive !== false
      };
    });
    return res.json({ success: true, data: { repositories: repos }});
  } catch (error) {
    console.error('Get user repos error:', error);
    return res.status(500).json({ success: false, error: { code: 'GET_ERROR', message: 'Failed to get repositories' }});
  }
});

// POST /api/user/repos - Save repository metadata
app.post('/api/user/repos', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { repoId, name, url, owner, repo, branch, localPath, source, fileCount, language } = req.body;

    if (!repoId || !name || !url) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'repoId, name, and url are required' }});
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' }});
    }

    // Check if repo exists - preserve existing fields if not provided
    const existingIndex = user.repositories.findIndex(r => r.id === repoId);
    const existing = existingIndex >= 0 ? user.repositories[existingIndex] : null;
    
    const repoData: any = {
      id: repoId,
      name,
      url,
      owner: owner || existing?.owner || '',
      repo: repo || existing?.repo || '',
      branch: branch || existing?.branch || 'main',
      localPath: localPath || existing?.localPath || '',
      source: source || existing?.source || 'github',
      fileCount: fileCount ?? existing?.fileCount,
      language: language ?? existing?.language,
      isActive: true,
      createdAt: existing?.createdAt || new Date()
    };

    if (existingIndex >= 0) {
      user.repositories[existingIndex] = repoData;
    } else {
      user.repositories.push(repoData);
    }
    // Mark array as modified to ensure Mongoose saves it
    user.markModified('repositories');
    await user.save();

    res.json({ success: true, data: { repository: repoData, message: 'Repository saved successfully' }});
  } catch (error) {
    console.error('Save user repo error:', error);
    res.status(500).json({ success: false, error: { code: 'SAVE_ERROR', message: 'Failed to save repository' }});
  }
});

// PATCH /api/user/repos/:repoId - Update repository metadata
app.patch('/api/user/repos/:repoId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { repoId } = req.params;
    const updates = req.body;

    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' }});
    }

    const index = user.repositories.findIndex(r => r.id === repoId);
    if (index < 0) {
      return res.status(404).json({ success: false, error: { code: 'REPO_NOT_FOUND', message: 'Repository not found' }});
    }

    user.repositories[index] = { ...user.repositories[index], ...updates };
    user.markModified('repositories');
    await user.save();

    res.json({ success: true, data: { repository: user.repositories[index] }});
  } catch (error) {
    console.error('Update user repo error:', error);
    res.status(500).json({ success: false, error: { code: 'UPDATE_ERROR', message: 'Failed to update repository' }});
  }
});

// DELETE /api/user/repos/:repoId - Remove repository metadata
app.delete('/api/user/repos/:repoId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { repoId } = req.params;

    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' }});
    }

    user.repositories = user.repositories.filter(r => r.id !== repoId);
    user.markModified('repositories');
    await user.save();

    res.json({ success: true, message: 'Repository removed from profile' });
  } catch (error) {
    console.error('Delete user repo error:', error);
    res.status(500).json({ success: false, error: { code: 'DELETE_ERROR', message: 'Failed to delete repository' }});
  }
});

// POST /api/user/repos/sync - Bulk sync repositories
app.post('/api/user/repos/sync', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { repositories } = req.body;

    if (!Array.isArray(repositories)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_DATA', message: 'repositories array is required' }});
    }

    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' }});
    }

    const results = { added: 0, updated: 0, failed: 0, repositories: [] as any[] };

    for (const repo of repositories) {
      try {
        if (!repo.repoId || !repo.name || !repo.url) {
          results.failed++;
          continue;
        }

        const existingIndex = user.repositories.findIndex(r => r.id === repo.repoId);
        const repoData: any = {
          id: repo.repoId,
          name: repo.name,
          url: repo.url,
          owner: repo.owner || '',
          repo: repo.repo || '',
          branch: repo.branch || 'main',
          localPath: repo.localPath || '',
          source: repo.source || 'github',
          fileCount: repo.fileCount,
          language: repo.language
        };

        if (existingIndex >= 0) {
          user.repositories[existingIndex] = { ...user.repositories[existingIndex], ...repoData };
          results.updated++;
        } else {
          user.repositories.push({ ...repoData, createdAt: new Date() });
          results.added++;
        }
      } catch {
        results.failed++;
      }
    }

    user.markModified('repositories');
    await user.save();
    results.repositories = user.repositories;

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Sync user repos error:', error);
    res.status(500).json({ success: false, error: { code: 'SYNC_ERROR', message: 'Failed to sync repositories' }});
  }
});

// GET /api/user/repos/restore-request - Get repos for restoration
app.get('/api/user/repos/restore-request', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' }});
    }

    // Map 'id' field to 'repoId' for frontend compatibility
    // Default source to 'github' for existing repos without source
    // Parse owner/repo from repoId if missing (format: {owner}_{repo}_{timestamp})
    const activeRepos = (user.repositories || [])
      .filter((r: any) => r.isActive !== false)
      .map((r: any) => {
        let owner = r.owner;
        let repo = r.repo;
        
        // Parse from repoId if owner/repo missing
        if ((!owner || !repo) && r.id) {
          const parts = r.id.split('_');
          if (parts.length >= 3) {
            owner = owner || parts[0];
            repo = repo || parts.slice(1, -1).join('_');
          }
        }
        
        return {
          ...r.toObject?.() || r,
          repoId: r.id,
          owner,
          repo,
          source: r.source || 'github',
          isActive: true
        };
      });

    res.json({
      success: true,
      data: {
        needsRestore: activeRepos.length > 0,
        repositories: activeRepos,
        message: activeRepos.length > 0 ? `Found ${activeRepos.length} repositories` : 'No repositories to restore'
      }
    });
  } catch (error) {
    console.error('Restore request error:', error);
    res.status(500).json({ success: false, error: { code: 'RESTORE_ERROR', message: 'Failed to get restore info' }});
  }
});

// Stats endpoint
app.get('/api/stats', (_req: Request, res: Response) => {
  res.json({ success: true, data: { totalRepos: 0, totalReviews: 0, totalWorkspaces: 0 } });
});

// Platform status endpoint
app.get('/api/platform/status', (_req: Request, res: Response) => {
  res.json({ 
    success: true, 
    data: { 
      status: 'healthy',
      version: '1.0.0',
      features: {
        githubClone: true,
        zipUpload: true,
        codeReview: true,
        workspaces: true
      }
    } 
  });
});

// Repos list endpoint (used by web-ui)
app.get('/api/repos', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).select('repositories updatedAt');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' },
      });
    }

    const repositories = await Promise.all(
      (user.repositories || [])
        .filter((r: any) => r?.isActive !== false)
        .map(async (r: any) => {
          const repoId = typeof r.id === 'string' ? r.id : '';
          if (!repoId) return null;

          const createdAt = r.createdAt || user.updatedAt || new Date();
          const updatedAt = r.updatedAt || r.createdAt || user.updatedAt || new Date();

          let owner = typeof r.owner === 'string' ? r.owner : '';
          let repo = typeof r.repo === 'string' ? r.repo : '';

          if ((!owner || !repo) && repoId) {
            const parts = repoId.split('_');
            if (parts.length >= 3) {
              owner = owner || parts[0];
              repo = repo || parts.slice(1, -1).join('_');
            }
          }

          let name = typeof r.name === 'string' ? r.name : '';
          if (!name) {
            name = owner && repo ? `${owner}/${repo}` : repoId;
          }

          const localPath = typeof r.localPath === 'string' && r.localPath
            ? r.localPath
            : path.join(process.cwd(), '.villa-repos', repoId);

          let fileCount = typeof r.fileCount === 'number' ? r.fileCount : 0;
          if (!fileCount && localPath) {
            try {
              fileCount = await countAllFiles(localPath);
            } catch {
              fileCount = 0;
            }
          }

          const url = typeof r.url === 'string'
            ? r.url
            : owner && repo
              ? `https://github.com/${owner}/${repo}`
              : undefined;

          return {
            id: repoId,
            name,
            url,
            path: localPath,
            createdAt,
            updatedAt,
            fileCount,
            language: typeof r.language === 'string' ? r.language : undefined,
          };
        })
    );

    return res.json({
      success: true,
      data: { repositories: repositories.filter(Boolean) },
    });
  } catch (error) {
    console.error('List repos error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: 'Failed to list repositories' },
    });
  }
});

// Error handling - moved inside main()
// app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
//   Logger.error('Server error:', err);
//   res.status(500).json({ success: false, error: err.message || 'Internal server error' });
// });

// 404 handler - moved inside main()
// app.use((_req: Request, res: Response) => {
//   res.status(404).json({ success: false, error: 'Not found' });
// });

// ============================================
// Server Startup
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Villa Backend Server (Cline Core Integration)      ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  try {
    // Connect to MongoDB (non-blocking — server starts even if DB is down)
    console.log('[INIT] Connecting to MongoDB...');
    mongoose.connect(MONGODB_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 5000 })
      .then(() => console.log('✓ Connected to MongoDB'))
      .catch((err) => console.warn('[WARN] MongoDB unavailable, DB routes will fail:', err.message));
    
    await ClineEndpoint.initialize(process.cwd())
    
    // Create real file-based storage context (persists to ~/.cline/data/)
    const storage = createStorageContext({ workspacePath: process.cwd() });
    
    console.log('[INIT] Initializing StateManager...');
    stateManager = await StateManager.initialize(storage);
    console.log('[INIT] StateManager ready');
    
    console.log('[INIT] Initializing Controller...');
    controller = new Controller({ stateManager } as any);
    console.log('[INIT] Controller ready');
    
    // Initialize workspace service
    const workspaceService = new WorkspaceExecutionService();
    workspaceService.initialize().catch((err: Error) => {
      Logger.error('[Server] Failed to initialize workspace service:', err);
    });
    
    // Mount additional API routes (AFTER controller is ready)
    const codeReviewRouter = createCodeReviewRouter(controller);
    app.use('/api', codeReviewRouter);
    app.use('/api/workspaces', createWorkspaceRouter(workspaceService));

    // ── Optional: GitHub PR Review pipeline ─────────────────────────────────
    // Mounted only if the three GitHub App env vars are set. The module is
    // self-contained under src/integrations/github-pr-review/ and can be
    // copied to any other Node + Express project.
    if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_WEBHOOK_SECRET) {
      try {
        const { createGitHubPRReviewer } = await import('./integrations/github-pr-review');
        const { createVillaPRValidator } = await import('./villa-github-pr-adapter');
        const reviewer = createGitHubPRReviewer({
          appId: process.env.GITHUB_APP_ID,
          privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
          webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
          checkName: process.env.GITHUB_APP_CHECK_NAME || 'Villa AI',
          validate: createVillaPRValidator(controller),
          logger: {
            info: (m, ...a) => Logger.info(`[github-pr-review] ${m}`, ...a),
            warn: (m, ...a) => Logger.warn(`[github-pr-review] ${m}`, ...a),
            error: (m, ...a) => Logger.error(`[github-pr-review] ${m}`, ...a),
            debug: (m, ...a) => Logger.debug(`[github-pr-review] ${m}`, ...a),
          },
        });
        app.use('/api/github-pr', reviewer.router);
        console.log('[INIT] GitHub PR review pipeline mounted at /api/github-pr');
      } catch (err) {
        Logger.error('[Server] Failed to mount GitHub PR pipeline:', err);
      }
    } else {
      console.log('[INIT] GitHub PR pipeline NOT mounted (set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET to enable)');
    }

    console.log('[INIT] Additional API routes mounted');
    
    // Error handling - MUST be after all routes
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      Logger.error('Server error:', err);
      res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    });

    // 404 handler - MUST be after all routes
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ success: false, error: 'Not found' });
    });
    
    // Log all registered routes
    console.log('[INIT] Registered routes:');
    codeReviewRouter.stack.forEach((r: any) => {
      if (r.route) {
        const methods = Object.keys(r.route.methods).join(',').toUpperCase();
        console.log(`  ${methods} /api${r.route.path}`);
      }
    });
    
    // Direct test route for clone (temporary debug)
    app.post('/api/repos/github/clone-test', async (req: Request, res: Response) => {
      console.log('[TEST] Clone endpoint hit directly');
      res.json({ success: true, message: 'Test endpoint works' });
    });
    
    const server = createServer(app);
    const portNum = parseInt(PORT as string, 10);
    
    server.listen(portNum, () => {
      console.log(`\n✓ Server ready!`);
      console.log(`  URL: http://${HOST}:${PORT}`);
      console.log(`  Health: http://${HOST}:${PORT}/health`);
      console.log(`  API:`);
      console.log(`    GET  /api/state           - Get current state`);
      console.log(`    POST /api/state/api-config - Update API config`);
      console.log(`    POST /api/state/settings  - Update settings`);
      console.log(`    POST /api/tasks           - Create new task`);
      console.log(`    POST /api/tasks/message   - Send message to task`);
      console.log(`    POST /api/tasks/cancel    - Cancel current task`);
      console.log(`    GET  /api/tasks/history   - Get task history`);
      console.log('');
    });
    
    process.on('SIGINT', async () => {
      console.log('\n[SHUTDOWN] Closing server...');
      await mongoose.connection.close();
      console.log('[SHUTDOWN] MongoDB connection closed');
      server.close(() => {
        console.log('[SHUTDOWN] Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n[SHUTDOWN] Closing server...');
      await mongoose.connection.close();
      console.log('[SHUTDOWN] MongoDB connection closed');
      server.close(() => {
        console.log('[SHUTDOWN] Server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('[FATAL] Failed to start server:', error);
    process.exit(1);
  }
}

main();
// reload bump 1780206226
