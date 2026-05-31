/**
 * Villa Web Server
 * 
 * Standalone Express server that wraps Cline's controller
 * for web-based code review functionality.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import * as path from 'path';
import * as http from 'http';
import { Controller } from '../../core/controller/index';
import { createCodeReviewRouter } from '../../core/controller/codeReviewRoutes';
import { Logger } from '../../shared/services/Logger';

export interface VillaServerConfig {
  port?: number;
  host?: string;
  corsOrigins?: string[];
  apiKey?: string;
  maxFileSize?: number;
  uploadDir?: string;
}

export class VillaWebServer {
  private app: Express;
  private server?: http.Server;
  private controller: Controller;
  private config: Required<VillaServerConfig>;

  constructor(controller: Controller, config: VillaServerConfig = {}) {
    this.controller = controller;
    this.config = {
      port: config.port || 3000,
      host: config.host || '0.0.0.0',
      corsOrigins: config.corsOrigins || ['*'],
      apiKey: config.apiKey || '',
      maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB
      uploadDir: config.uploadDir || path.join(process.cwd(), '.villa-uploads'),
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // File upload
    this.app.use(fileUpload({
      limits: { fileSize: this.config.maxFileSize },
      createParentPath: true,
      useTempFiles: true,
      tempFileDir: this.config.uploadDir,
    }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        Logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });

    // API key authentication (if configured)
    if (this.config.apiKey) {
      this.app.use('/api', (req: Request, res: Response, next: NextFunction): void => {
        const key = req.headers['x-api-key'] || req.query.apiKey;
        if (key !== this.config.apiKey) {
          res.status(401).json({
            success: false,
            error: 'Invalid or missing API key'
          });
          return;
        }
        next();
      });
    }
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'villa-code-review',
        timestamp: new Date().toISOString(),
      });
    });

    // Code review API routes
    this.app.use('/api', createCodeReviewRouter(this.controller));

    // WebSocket upgrade endpoint
    this.app.get('/ws', (req: Request, res: Response) => {
      res.status(426).json({
        error: 'Upgrade required',
        message: 'Use WebSocket connection'
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Not found',
        path: req.path
      });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      Logger.error('Server error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
      });
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        Logger.info(`Villa Code Review Server running on ${this.config.host}:${this.config.port}`);
        Logger.info(`Health check: http://${this.config.host}:${this.config.port}/health`);
        resolve();
      });

      this.server?.on('error', (err) => {
        Logger.error('Server failed to start:', err);
        reject(err);
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          Logger.info('Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      port: this.config.port,
      host: this.config.host,
      running: !!this.server,
    };
  }
}

export default VillaWebServer;
