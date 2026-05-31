/**
 * test-compliance-prompt.ts
 *
 * End-to-end test of Layer D — the AI Semantic Compliance Reviewer.
 *
 * Verifies:
 *   1. POST /scan returns findings that came from the NEW compliance prompt
 *      (not the old generic code-reviewer prompt).
 *   2. Findings include the new compliance fields: `category`, `storeRule`.
 *   3. At least one SECURITY finding flags the hardcoded JWT secret in
 *      `controllers/userControllers.js` — proof the compliance prompt
 *      is doing its job.
 *   4. Autofix end-to-end still works against a compliance finding.
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

async function run() {
	const line = "═".repeat(70)
	console.log(`\n${line}\n  Villa Layer D — AI Compliance Reviewer E2E Test\n${line}\n`)

	// ── Step 1: Auth ──
	console.log("[1/4] Authenticating...")
	const auth = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD })
	const token = auth.data?.token ?? auth.data?.data?.token
	if (!token) {
		console.error("  ✗ Login failed")
		process.exit(1)
	}
	console.log(`  ✓ Logged in as ${EMAIL}\n`)

	// ── Step 2: Scan ──
	console.log("[2/4] Scanning repo with NEW compliance prompt (this calls OpenRouter — slow)...")
	const scan = await api("POST", `/repos/${REPO_ID}/scan`, { maxFiles: 50 }, token)
	const issues: any[] = scan.data?.data?.issues ?? []
	console.log(`  ✓ Got ${issues.length} findings\n`)

	// ── Step 3: Verify the prompt actually changed the model's output shape ──
	console.log("[3/4] Verifying compliance-prompt fields are present...")

	const withCategory = issues.filter((i) => typeof i.category === "string")
	const withStoreRule = issues.filter((i) => typeof i.storeRule === "string")
	const categories = new Set(withCategory.map((i) => i.category))

	console.log(`     Findings with "category" field      : ${withCategory.length} / ${issues.length}`)
	console.log(`     Findings with "storeRule" field     : ${withStoreRule.length} / ${issues.length}`)
	console.log(`     Distinct categories seen           : ${[...categories].join(", ") || "(none)"}`)

	if (withCategory.length === 0) {
		console.error("\n  ✗ FAIL: no findings carry the new compliance `category` field.")
		console.error("           Either the prompt didn't load, the model ignored it, or the")
		console.error("           normalize step is stripping it. Check VillaCodeReviewService.ts.")
		process.exit(1)
	}

	// Look for the canonical SECURITY hit: the hardcoded JWT secret in
	// controllers/userControllers.js. If the new prompt is working it MUST
	// catch this — it's textbook "hardcoded API secret" territory.
	const jwtFinding = issues.find(
		(i) =>
			String(i.file ?? "").toLowerCase().includes("usercontrollers") &&
			(i.category === "SECURITY" ||
				/jwt|secret|hardcod/i.test(String(i.message ?? "")) ||
				/jwt|secret|hardcod/i.test(String(i.ruleId ?? ""))),
	)

	if (!jwtFinding) {
		console.error("\n  ✗ FAIL: compliance prompt did not catch the hardcoded JWT secret in")
		console.error("           controllers/userControllers.js. This is the canonical test case.")
		console.error("           Either the prompt is too weak or the model didn't see the file.")
		process.exit(1)
	}

	console.log(`\n  ✓ Compliance fields present.`)
	console.log(`  ✓ SECURITY finding for hardcoded JWT secret detected:`)
	console.log(`       file       : ${jwtFinding.file}`)
	console.log(`       line       : ${jwtFinding.line}`)
	console.log(`       category   : ${jwtFinding.category ?? "(missing)"}`)
	console.log(`       ruleId     : ${jwtFinding.ruleId}`)
	console.log(`       storeRule  : ${jwtFinding.storeRule ?? "(none)"}`)
	console.log(`       message    : ${String(jwtFinding.message).slice(0, 100)}\n`)

	// Show category distribution
	const byCategory: Record<string, number> = {}
	for (const i of issues) {
		const c = i.category ?? "(uncategorized)"
		byCategory[c] = (byCategory[c] ?? 0) + 1
	}
	console.log("  Category distribution:")
	for (const [cat, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
		console.log(`     ${cat.padEnd(20)} ${n}`)
	}
	console.log()

	// ── Step 4: Run autofix on the JWT finding ──
	console.log("[4/4] Running autofix on the JWT-secret finding...")

	if (!jwtFinding.suggestedFix?.replacement) {
		console.warn("  ! JWT finding has no suggestedFix.replacement → autofix path can't apply it directly.")
		console.warn("    The compliance detection still passed; autofix needs a mechanical replacement to run.")
		process.exit(0)
	}

	const filePath = path.join(REPO_PATH, String(jwtFinding.file).replace(/\\/g, "/"))
	const contentBefore = fs.readFileSync(filePath, "utf-8")

	const autofixRes = await api("POST", `/repos/${REPO_ID}/autofix`, { issue: jwtFinding }, token)
	if (!autofixRes.data?.success) {
		console.error(`  ✗ Autofix POST failed: ${autofixRes.raw.slice(0, 200)}`)
		process.exit(1)
	}
	if (autofixRes.data.data?.alreadyResolved) {
		console.log("  ✓ Server short-circuited — replacement already present (acceptable result).")
		process.exit(0)
	}

	const taskId = autofixRes.data.data?.taskId
	console.log(`     Task started: ${taskId}`)

	for (let tick = 1; tick <= MAX_POLL_TICKS; tick++) {
		await sleep(POLL_INTERVAL_MS)
		const contentNow = fs.readFileSync(filePath, "utf-8")
		if (contentNow !== contentBefore) {
			console.log(`\n  ✓ File on disk CHANGED at tick ${tick}`)
			console.log(`       ${contentBefore.length} → ${contentNow.length} bytes`)
			console.log()
			console.log(`${line}\n  Layer D verification: PASS\n${line}\n`)
			process.exit(0)
		}
		const status = await api("GET", `/repos/${REPO_ID}/autofix/${taskId}/status`, undefined, token)
		if (!status.data?.data?.isStreaming && !status.data?.data?.isActive && tick > 4) {
			console.error(`\n  ✗ Autofix task ended without disk change`)
			console.error(`       (tick=${tick}, isActive=${status.data?.data?.isActive})`)
			process.exit(1)
		}
	}

	console.error("\n  ✗ Polling timed out without disk change")
	process.exit(1)
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
