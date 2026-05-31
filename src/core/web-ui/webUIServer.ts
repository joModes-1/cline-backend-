/**
 * Web UI Server Integration
 * 
 * Serves the Villa Web UI static files and handles SPA routing
 * for the React-based frontend.
 */

import * as path from 'path';
import * as fs from 'fs';
import { Router } from 'express';
import { Logger } from '../../shared/services/Logger';
import { createWorkspaceRouter } from '../controller/workspaceRoutes';
import { WorkspaceExecutionService } from '../../services/workspace/WorkspaceExecutionService';

export function createWebUIServer(): Router {
  const router = Router();
  
  // Initialize workspace service
  const workspaceService = new WorkspaceExecutionService();
  workspaceService.initialize().catch(err => {
    Logger.error('[WebUI] Failed to initialize workspace service:', err);
  });
  
  // Path to web-ui build directory
  const webUIPath = path.join(__dirname, '../../../../web-ui/dist');
  
  // Check if web UI is built
  const indexPath = path.join(webUIPath, 'index.html');
  const webUIExists = fs.existsSync(indexPath);
  
  if (!webUIExists) {
    Logger.warn('[WebUI] Web UI build not found at:', webUIPath);
    Logger.warn('[WebUI] Please run "npm run build" in the web-ui directory');
  } else {
    Logger.info('[WebUI] Serving web UI from:', webUIPath);
  }

  // Serve static files from web-ui/dist
  if (webUIExists) {
    router.use('/static', (req, res, next) => {
      const filePath = path.join(webUIPath, 'assets', req.path);
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        next();
      }
    });

    // Serve assets
    router.use('/assets', (req, res, next) => {
      const filePath = path.join(webUIPath, 'assets', req.path);
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        next();
      }
    });
  }

  // Auth endpoints for web UI
  router.post('/auth/login', async (req, res) => {
    // TODO: Integrate with Cline AuthService
    res.json({
      success: false,
      message: 'Auth not yet implemented. Use API tokens.'
    });
  });

  router.post('/auth/register', async (req, res) => {
    // TODO: Integrate with Cline AuthService
    res.json({
      success: false,
      message: 'Registration not yet implemented'
    });
  });

  router.get('/auth/profile', async (req, res) => {
    // TODO: Integrate with Cline AuthService
    res.json({
      success: false,
      message: 'Profile not yet implemented'
    });
  });

  router.get('/auth/providers', (req, res) => {
    res.json({
      success: true,
      data: {
        providers: { google: false, github: false, email: true },
        hasOAuth: false,
        requiresEmailAuth: true
      }
    });
  });

  // Workspace API routes
  router.use('/workspaces', createWorkspaceRouter(workspaceService));

  // SPA fallback - serve index.html for all non-API routes
  router.get('*', (req, res) => {
    if (!webUIExists) {
      res.status(503).json({
        success: false,
        error: 'Web UI not built',
        message: 'Please build the web UI first by running "npm run build" in the web-ui directory'
      });
      return;
    }
    
    res.sendFile(indexPath);
  });

  return router;
}

export default createWebUIServer;
