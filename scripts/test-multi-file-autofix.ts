/**
 * test-multi-file-autofix.ts
 *
 * Runs the autofix pipeline against three specific target files in a single repo,
 * verifying that each file is actually modified on disk. Same code path as the
 * UI "Apply Fix" button (POST /repos/:repoId/autofix).
 *
 * Usage:
 *   npx tsx scripts/test-multi-file-autofix.ts
 */

import * as fs from "fs"
import * as path from "path"

const BASE_URL = "http://localhost:3004/api"
const EMAIL = "jomodes11@gmail.com"
const PASSWORD = "password"
const REPO_ID = "joModes-1_chatapp-backend_1775722589874"
const REPO_PATH = path.join(
	"C:/Users/USER/Downloads/ClineMainCopyV2/cline-main/.villa-repos",
	REPO_ID,
)
const TARGET_FILES = ["config\\db.js", "controllers\\userControllers.js", "server.js"]
const POLL_INTERVAL_MS = 2000
const MAX_POLL_TICKS = 60

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms))
}

async function api(method: string, endpoint: string, body?: unknown, token?: string) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Connection: "close",
	}
	if (token) headers["Authorization"] = `Bearer ${token}`
	let lastErr: unknown
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const res = await fetch(`${BASE_URL}${endpoint}`, {
				method,
				headers,
				...(body ? { body: JSON.stringify(body) } : {}),
			})
			const text = await res.text()
			try {
				return { status: res.status, data: JSON.parse(text), raw: text }
			} catch {
				return { status: res.status, data: null, raw: text }
			}
		} catch (err) {
			lastErr = err
			const code = (err as any)?.cause?.code
			if (code !== "ECONNRESET" && code !== "UND_ERR_SOCKET") throw err
			await sleep(300)
		}
	}
	throw lastErr
}

type Outcome = {
	file: string
	chosenIssue?: string
	taskId?: string
	tickWhenChanged?: number
	beforeBytes: number
	afterBytes: number
	changed: boolean
	error?: string
}

async function runOneFile(token: string, allIssues: any[], targetFile: string): Promise<Outcome> {
	const filePath = path.join(REPO_PATH, targetFile)
	const contentBefore = fs.readFileSync(filePath, "utf-8")

	// Find an issue in this file whose suggestedFix isn't already applied.
	const candidates = allIssues.filter((i) => {
		if (!i.file || !i.suggestedFix?.replacement) return false
		if (String(i.file).toLowerCase() !== targetFile.toLowerCase()) return false
		return !contentBefore.includes(i.suggestedFix.replacement)
	})

	if (candidates.length === 0) {
		return {
			file: targetFile,
			beforeBytes: contentBefore.length,
			afterBytes: contentBefore.length,
			changed: false,
			error: "No fixable issue found (all suggestions already present)",
		}
	}

	const chosen = candidates[0]
	const autofixRes = await api("POST", `/repos/${REPO_ID}/autofix`, { issue: chosen }, token)
	if (!autofixRes.data?.success) {
		return {
			file: targetFile,
			chosenIssue: chosen.ruleId,
			beforeBytes: contentBefore.length,
			afterBytes: contentBefore.length,
			changed: false,
			error: `Autofix POST failed: ${autofixRes.raw.slice(0, 200)}`,
		}
	}

	if (autofixRes.data.data?.alreadyResolved) {
		return {
			file: targetFile,
			chosenIssue: chosen.ruleId,
			beforeBytes: contentBefore.length,
			afterBytes: contentBefore.length,
			changed: false,
			error: "Server short-circuited (already resolved)",
		}
	}

	const taskId = autofixRes.data.data?.taskId
	if (!taskId) {
		return {
			file: targetFile,
			chosenIssue: chosen.ruleId,
			beforeBytes: contentBefore.length,
			afterBytes: contentBefore.length,
			changed: false,
			error: "No taskId returned",
		}
	}

	for (let tick = 1; tick <= MAX_POLL_TICKS; tick++) {
		await sleep(POLL_INTERVAL_MS)
		const statusRes = await api(
			"GET",
			`/repos/${REPO_ID}/autofix/${taskId}/status`,
			undefined,
			token,
		)
		const status = statusRes.data?.data ?? {}

		// Read disk directly each tick — definitive proof of write.
		const contentNow = fs.readFileSync(filePath, "utf-8")
		if (contentNow !== contentBefore) {
			return {
				file: targetFile,
				chosenIssue: chosen.ruleId,
				taskId,
				tickWhenChanged: tick,
				beforeBytes: contentBefore.length,
				afterBytes: contentNow.length,
				changed: true,
			}
		}

		if (!status.isStreaming && !status.isActive && tick > 3) {
			return {
				file: targetFile,
				chosenIssue: chosen.ruleId,
				taskId,
				beforeBytes: contentBefore.length,
				afterBytes: contentNow.length,
				changed: false,
				error: `Task ended without disk change (didEditFile=${status.didEditFile}, mistakes=${status.consecutiveMistakeCount})`,
			}
		}
	}

	const contentAfter = fs.readFileSync(filePath, "utf-8")
	return {
		file: targetFile,
		chosenIssue: chosen.ruleId,
		taskId,
		beforeBytes: contentBefore.length,
		afterBytes: contentAfter.length,
		changed: contentAfter !== contentBefore,
		error: contentAfter === contentBefore ? "Polling timed out" : undefined,
	}
}

async function run() {
	const line = "═".repeat(65)
	console.log(`\n${line}\n  Villa Multi-File Autofix Test\n${line}\n`)

	console.log("[1/3] Authenticating...")
	const auth = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD })
	const token = auth.data?.token ?? auth.data?.data?.token
	if (!token) {
		console.error("  ✗ Login failed:", auth.raw.slice(0, 200))
		process.exit(1)
	}
	console.log(`  ✓ Logged in as ${EMAIL}\n`)

	console.log("[2/3] Scanning repository (uses cache where possible)...")
	const scan = await api("POST", `/repos/${REPO_ID}/scan`, { maxFiles: 50 }, token)
	const issues: any[] = scan.data?.data?.issues ?? []
	console.log(`  ✓ ${issues.length} issues found across repo\n`)

	console.log(`[3/3] Running autofix on ${TARGET_FILES.length} target files (sequential)...\n`)
	const outcomes: Outcome[] = []
	for (const target of TARGET_FILES) {
		console.log(`  ── ${target} ──`)
		const out = await runOneFile(token, issues, target)
		outcomes.push(out)
		if (out.changed) {
			console.log(
				`    ✓ CHANGED  rule=${out.chosenIssue}  bytes: ${out.beforeBytes}→${out.afterBytes}  tick=${out.tickWhenChanged}`,
			)
		} else {
			console.log(`    ✗ NOT CHANGED  ${out.error ?? "unknown reason"}`)
		}
	}

	console.log(`\n${line}`)
	console.log("  Summary")
	console.log(line)
	const passed = outcomes.filter((o) => o.changed).length
	for (const o of outcomes) {
		const status = o.changed ? "✓" : "✗"
		console.log(
			`  ${status} ${o.file.padEnd(40)} ${o.changed ? `(${o.beforeBytes}→${o.afterBytes} bytes)` : o.error ?? ""}`,
		)
	}
	console.log(`\n  ${passed} / ${outcomes.length} files modified on disk`)
	console.log(line)

	process.exit(passed === outcomes.length ? 0 : 1)
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
