/**
 * Workspace API Routes
 *
 * REST API endpoints for workspace management and code execution
 */

import { Router, Request, Response } from "express"
import { Logger } from "../../shared/services/Logger"
import { WorkspaceExecutionService } from "../../services/workspace/WorkspaceExecutionService"
import { DevfileParser } from "../../services/workspace/DevfileParser"
import type { CreateWorkspaceRequest, ExecutionRequest } from "../../services/workspace/types"

/**
 * Create workspace API router
 */
export function createWorkspaceRouter(workspaceService: WorkspaceExecutionService): Router {
	const router = Router()
	const devfileParser = new DevfileParser()

	// ============================================
	// Workspace Management
	// ============================================

	/**
	 * POST /api/workspaces
	 * Create a new workspace
	 */
	router.post("/", async (req: Request, res: Response) => {
		Logger.info("[API] POST /api/workspaces - Create workspace")

		try {
			const { name, devfile, repoId, autoStart = false } = req.body

			if (!devfile || !devfile.metadata?.name) {
				res.status(400)
				res.json({
					success: false,
					error: "Missing required field: devfile with metadata.name",
				})
				return
			}

			// Validate devfile
			const parseResult = devfileParser.parse(JSON.stringify(devfile))
			if (!parseResult.valid) {
				res.status(400).json({
					success: false,
					error: "Invalid devfile",
					details: parseResult.errors,
				})
				return
			}

			const request: CreateWorkspaceRequest = {
				devfile: parseResult.devfile!,
				repoId,
				autoStart,
			}

			const workspace = await workspaceService.createWorkspace(request)

			Logger.info(`[API] ✓ Workspace created: ${workspace.metadata.id}`)

			res.status(201).json({
				success: true,
				data: {
					workspaceId: workspace.metadata.id,
					name: workspace.metadata.name,
					status: workspace.status?.phase,
					createdAt: workspace.metadata.creationTimestamp,
				},
			})
		} catch (error) {
			Logger.error("[API] ✗ Failed to create workspace:", error)
			res.status(500)
			res.json({
				success: false,
				error: error instanceof Error ? error.message : "Failed to create workspace",
			})
			return
		}
	})

	/**
	 * POST /api/workspaces/from-repo
	 * Create workspace from repository
	 */
	router.post("/from-repo", async (req: Request, res: Response) => {
		Logger.info("[API] POST /api/workspaces/from-repo - Create workspace from repo")

		try {
			const { repoId, language, autoStart = true } = req.body

			if (!repoId) {
				res.status(400)
				res.json({
					success: false,
					error: "Missing required field: repoId",
				})
				return
			}

			const workspace = await workspaceService.createWorkspaceFromRepo(repoId, language, autoStart)

			Logger.info(`[API] ✓ Workspace created from repo: ${workspace.metadata.id}`)

			res.status(201).json({
				success: true,
				data: {
					workspaceId: workspace.metadata.id,
					name: workspace.metadata.name,
					status: workspace.status?.phase,
					language: workspace.metadata.labels?.language,
					repoId,
				},
			})
		} catch (error) {
			Logger.error("[API] ✗ Failed to create workspace from repo:", error)
			res.status(500)
			res.json({
				success: false,
				error: error instanceof Error ? error.message : "Failed to create workspace",
			})
			return
		}
	})

	/**
	 * GET /api/workspaces
	 * List all workspaces
	 */
	router.get("/", async (_req: Request, res: Response) => {
		Logger.info("[API] GET /api/workspaces - List workspaces")

		try {
			const list = workspaceService.listWorkspaces()

			res.json({
				success: true,
				data: {
					workspaces: list.workspaces.map((w) => ({
						workspaceId: w.metadata.id,
						name: w.metadata.name,
						status: w.status?.phase,
						createdAt: w.metadata.creationTimestamp,
						language: w.metadata.labels?.language,
					})),
					total: list.total,
				},
			})
		} catch (error) {
			Logger.error("[API] ✗ Failed to list workspaces:", error)
			res.status(500)
			res.json({
				success: false,
				error: "Failed to list workspaces",
			})
			return
		}
	})

	/**
	 * GET /api/workspaces/:id
	 * Get workspace details
	 */
	router.get("/:id", async (req: Request, res: Response): Promise<void> => {
		const id = String(req.params.id)
		Logger.info(`[API] GET /api/workspaces/${id} - Get workspace`)

		try {
			const workspace = workspaceService.getWorkspace(id)

			if (!workspace) {
				res.status(404)
				res.json({
					success: false,
					error: "Workspace not found",
				})
				return
			}

			res.json({
				success: true,
				data: {
					workspaceId: workspace.metadata.id,
					name: workspace.metadata.name,
					status: workspace.status?.phase,
					statusMessage: workspace.status?.message,
					createdAt: workspace.metadata.creationTimestamp,
					started: workspace.spec.started,
					devfile: workspace.devfile,
					runtime: workspace.runtime,
				},
			})
		} catch (error) {
			Logger.error(`[API] ✗ Failed to get workspace ${id}:`, error)
			res.status(500)
			res.json({
				success: false,
				error: "Failed to get workspace",
			})
			return
		}
	})

	/**
	 * POST /api/workspaces/:id/start
	 * Start a workspace
	 */
	router.post("/:id/start", async (req: Request, res: Response): Promise<void> => {
		const id = String(req.params.id)
		Logger.info(`[API] POST /api/workspaces/${id}/start - Start workspace`)

		try {
			const workspace = await workspaceService.startWorkspace(id)

			res.json({
				success: true,
				data: {
					workspaceId: workspace.metadata.id,
					status: workspace.status?.phase,
					message: workspace.status?.message,
				},
			})
		} catch (error) {
			Logger.error(`[API] ✗ Failed to start workspace ${id}:`, error)
			res.status(500)
			res.json({
				success: false,
				error: error instanceof Error ? error.message : "Failed to start workspace",
			})
			return
		}
	})

	/**
	 * POST /api/workspaces/:id/stop
	 * Stop a workspace
	 */
	router.post("/:id/stop", async (req: Request, res: Response): Promise<void> => {
		const id = String(req.params.id)
		Logger.info(`[API] POST /api/workspaces/${id}/stop - Stop workspace`)

		try {
			const workspace = await workspaceService.stopWorkspace(id)

			res.json({
				success: true,
				data: {
					workspaceId: workspace.metadata.id,
					status: workspace.status?.phase,
				},
			})
		} catch (error) {
			Logger.error(`[API] ✗ Failed to stop workspace ${id}:`, error)
			res.status(500)
			res.json({
				success: false,
				error: error instanceof Error ? error.message : "Failed to stop workspace",
			})
			return
		}
	})

	/**
	 * DELETE /api/workspaces/:id
	 * Delete a workspace
	 */
	router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
		const id = String(req.params.id)
		Logger.info(`[API] DELETE /api/workspaces/${id} - Delete workspace`)

		try {
			await workspaceService.deleteWorkspace(id)

			res.json({
				success: true,
				data: {
					workspaceId: id,
					deleted: true,
				},
			})
		} catch (error) {
			Logger.error(`[API] ✗ Failed to delete workspace ${id}:`, error)
			res.status(500)
			res.json({
				success: false,
				error: error instanceof Error ? error.message : "Failed to delete workspace",
			})
			return
		}
	})

	// ============================================
	// Code Execution
	// ============================================

	/**
	 * POST /api/workspaces/:id/execute
	 * Execute code in workspace
	 */
	router.post("/:id/execute", async (req: Request, res: Response): Promise<void> => {
		const id = String(req.params.id)
		Logger.info(`[API] POST /api/workspaces/${id}/execute - Execute code`)

		try {
			const { code, language, fileName, input, timeout } = req.body

			if (!code) {
				res.status(400)
				res.json({
					success: false,
					error: "Missing required field: code",
				})
				return
			}

			const executionRequest: ExecutionRequest = {
				code,
				language,
				fileName,
				input,
				timeout,
				workspaceId: id,
			}

			const result = await workspaceService.executeCode(id, executionRequest)

			res.json({
				success: true,
				data: {
					executionId: result.executionId,
					status: result.status,
					stdout: result.stdout,
					stderr: result.stderr,
					exitCode: result.exitCode,
					duration: result.duration,
				},
			})
		} catch (error) {
			Logger.error(`[API] ✗ Failed to execute code in workspace ${id}:`, error)
			res.status(500)
			res.json({
				success: false,
				error: error instanceof Error ? error.message : "Failed to execute code",
			})
			return
		}
	})

	/**
	 * GET /api/workspaces/:id/status
	 * Get workspace status
	 */
	router.get("/:id/status", async (req: Request, res: Response): Promise<void> => {
		const id = String(req.params.id)

		try {
			const status = workspaceService.getWorkspaceStatus(id)

			if (!status) {
				res.status(404)
				res.json({
					success: false,
					error: "Workspace not found",
				})
				return
			}

			res.json({
				success: true,
				data: {
					workspaceId: id,
					phase: status.phase,
					message: status.message,
					mainUrl: status.mainUrl,
				},
			})
		} catch (error) {
			Logger.error(`[API] ✗ Failed to get workspace status ${id}:`, error)
			res.status(500)
			res.json({
				success: false,
				error: "Failed to get workspace status",
			})
			return
		}
	})

	/**
	 * GET /api/workspaces/:id/logs
	 * Get workspace logs
	 */
	router.get("/:id/logs", async (req: Request, res: Response): Promise<void> => {
		const id = String(req.params.id)

		try {
			const logs = await workspaceService.getWorkspaceLogs(id)

			res.json({
				success: true,
				data: {
					workspaceId: id,
					logs,
				},
			})
		} catch (error) {
			Logger.error(`[API] ✗ Failed to get workspace logs ${id}:`, error)
			res.status(500)
			res.json({
				success: false,
				error: "Failed to get workspace logs",
			})
			return
		}
	})

	// ============================================
	// Devfile Templates
	// ============================================

	/**
	 * GET /api/devfiles/templates
	 * List devfile templates
	 */
	router.get("/templates/devfiles", async (_req: Request, res: Response) => {
		Logger.info("[API] GET /api/devfiles/templates - List templates")

		try {
			const configs = devfileParser.getLanguageConfigs()

			res.json({
				success: true,
				data: {
					templates: configs.map((config) => ({
						id: config.id,
						name: config.displayName,
						language: config.id,
						dockerImage: config.dockerImage,
						fileExtensions: config.fileExtensions,
						defaultTimeout: config.defaultTimeout,
						memoryLimit: config.memoryLimit,
					})),
				},
			})
		} catch (error) {
			Logger.error("[API] ✗ Failed to list devfile templates:", error)
			res.status(500)
			res.json({
				success: false,
				error: "Failed to list templates",
			})
			return
		}
	})

	/**
	 * POST /api/devfiles/generate
	 * Generate devfile from language
	 */
	router.post("/templates/devfiles/generate", async (req: Request, res: Response): Promise<void> => {
		Logger.info("[API] POST /api/devfiles/generate - Generate devfile")

		try {
			const { language, name, repoUrl } = req.body

			if (!language) {
				res.status(400)
				res.json({
					success: false,
					error: "Missing required field: language",
				})
				return
			}

			const devfile = devfileParser.generateFromLanguage(language, name, repoUrl)

			res.json({
				success: true,
				data: {
					devfile,
				},
			})
		} catch (error) {
			Logger.error("[API] ✗ Failed to generate devfile:", error)
			res.status(500).json({
				success: false,
				error: error instanceof Error ? error.message : "Failed to generate devfile",
			})
		}
	})

	return router
}
