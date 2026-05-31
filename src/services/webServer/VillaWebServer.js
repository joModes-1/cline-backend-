/**
 * Villa Web Server
 *
 * Standalone Express server that wraps Cline's controller
 * for web-based code review functionality.
 */
import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import * as path from 'path';
import { createCodeReviewRouter } from '../../core/controller/codeReviewRoutes';
import { Logger } from '../../shared/services/Logger';
export class VillaWebServer {
    app;
    server;
    controller;
    config;
    constructor(controller, config = {}) {
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
    setupMiddleware() {
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
        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                Logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
            });
            next();
        });
        // API key authentication (if configured)
        if (this.config.apiKey) {
            this.app.use('/api', (req, res, next) => {
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
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                service: 'villa-code-review',
                timestamp: new Date().toISOString(),
            });
        });
        // Code review API routes
        this.app.use('/api', createCodeReviewRouter(this.controller));
        // WebSocket upgrade endpoint
        this.app.get('/ws', (req, res) => {
            res.status(426).json({
                error: 'Upgrade required',
                message: 'Use WebSocket connection'
            });
        });
    }
    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Not found',
                path: req.path
            });
        });
        // Error handler
        this.app.use((err, req, res, next) => {
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
    async start() {
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
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    Logger.info('Server stopped');
                    resolve();
                });
            }
            else {
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
//# sourceMappingURL=VillaWebServer.js.map