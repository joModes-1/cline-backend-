# Autofix Loop Prompt — paste this into a fresh Claude Code session

---

## YOUR ROLE
You are the autonomous debugger for the Villa Audit Compliance Engine's **autofix feature**. Your single job: make the "Apply Fix" button actually edit files on disk. You may NOT stop, ask clarifying questions, or change scope until the test `scripts/test-real-autofix.ts` reports **`File CHANGED ✅`**.

Constraints (non-negotiable):
- Touch ONLY code in the autofix path. Do not refactor, do not improve unrelated code.
- Do not skip hooks, do not bypass signing, do not run destructive git commands.
- Do not log or expose any API keys (especially `sk-or-v1-...`).
- Make small, targeted changes. After each change, run the test, read the server logs, decide the next step.
- Use parallel tool calls when reading independent files.
- Never claim success without running the test and seeing `File CHANGED ✅`.

---

## THE BUG (current state, verified)

When the UI "Apply Fix" button (or `scripts/test-real-autofix.ts`) hits `POST /api/repos/:repoId/autofix`:
1. Cline agent task starts ✅
2. AI calls `write_to_file` tool ✅
3. `WriteToFileToolHandler.execute()` is reached ✅ (logged as `[WriteToFileTool] ▶ execute called`)
4. **Something fails or returns early** ❌ — `[FileEditProvider] Saving document to disk` never appears
5. File on disk is unchanged ❌

The handler call returns in under 1 second — way too fast for the auto-approval flow (which has a built-in 3.5 s delay before save). Something exits early between `execute()` start and `saveChanges()`.

---

## DIAGNOSTIC INFRASTRUCTURE ALREADY IN PLACE

I added three `Logger.info(...)` calls to [cline-main/src/core/task/tools/handlers/WriteToFileToolHandler.ts](cline-main/src/core/task/tools/handlers/WriteToFileToolHandler.ts):

1. Right after `validateAndPrepareFileOperation`:
   ```
   [WriteToFileTool] validateAndPrepareFileOperation returned: relPath=... absolutePath=...
   ```
   or
   ```
   [WriteToFileTool] Early exit: validateAndPrepareFileOperation returned falsy
   ```

2. Right after `shouldAutoApproveToolWithPath`:
   ```
   [WriteToFileTool] shouldAutoApproveToolWithPath(write_to_file, <path>) = <true|false>
   ```

3. Right before `saveChanges()`:
   ```
   [WriteToFileTool] Calling saveChanges() for <path>
   ```

And in [cline-main/src/core/task/index.ts](cline-main/src/core/task/index.ts):
```
[Task] diffViewProvider=FileEditProvider (backgroundEditEnabled=true)
```

When `[Task] diffViewProvider=ExternalDiffViewProvider` appears instead, the headless-write fix has regressed — re-check `autofixTaskSettings` in `codeReviewRoutes.ts`.

---

## CHANGES ALREADY APPLIED (do not re-do)

1. **[cline-main/src/core/controller/codeReviewRoutes.ts](cline-main/src/core/controller/codeReviewRoutes.ts)** — autofix task now passes `backgroundEditEnabled: true` so the task uses `FileEditProvider` (direct `fs.writeFile`) instead of `ExternalDiffViewProvider` (gRPC editor UI that doesn't exist in headless mode). The diff endpoint also exposes `lastMessages` (last 10 Cline messages) in the status response.
2. **WriteToFileToolHandler.ts** — three diagnostic logs added (above).
3. **task/index.ts** — diagnostic log for which DiffViewProvider was selected.

---

## HOW TO TEST (every iteration)

1. Confirm server is up: `curl -s http://localhost:3004/api/health`
   - If down, tell the user to run `npm run dev` in `cline-main/`. Do not start it yourself — it requires their terminal.
   - If it's up but auth is failing with 500, the tsx watch reload broke MongoDB. Ask the user for a clean Ctrl+C + `npm run dev`.

2. Run the test:
   ```
   cd cline-main && npx tsx scripts/test-real-autofix.ts
   ```
   It picks the first issue whose `suggestedFix.replacement` is NOT already in the file, hits `POST /autofix`, polls `GET /autofix/:taskId/diff` and `/status` every 2 s for up to 120 s, then reads the file from disk.

3. **Read the SERVER terminal logs** (the user's `npm run dev` terminal). The script's stdout shows polling state only; the AI's behavior shows up in the server log.

4. Success criteria: the test script prints `File CHANGED ✅` AND `[FileEditProvider] Saving document to disk` appears in the server log.

---

## INVESTIGATION TREE (use this to narrow the failure)

After running the test, find which of these logs appears LAST in the server output, and follow the matching branch:

### Branch A — `[Task] diffViewProvider=ExternalDiffViewProvider` appeared
The `backgroundEditEnabled` setting didn't propagate. Check:
- `taskStateCache` in `StateManager` — is the key written before `new Task(...)` is constructed?
- `controller.initTask()` order — `setTaskSettingsBatch` must run before `new Task(...)`.
- `getGlobalSettingsKey("backgroundEditEnabled")` priority (remoteConfig > sessionOverride > taskState > global).

### Branch B — `validateAndPrepareFileOperation returned: null/undefined`
Path resolution or `.clineignore` failure. The AI is calling `write_to_file` with an **absolute Windows path** like `C:\Users\USER\...\config\db.js`. Check:
- `resolveWorkspacePath` behavior with absolute paths
- `checkClineIgnorePath(resolvedPath)` — is `.villa-repos` ignored? Look for any `.clineignore` in the repo or under `.villa-repos/<repoId>/`.
- The `accessValidation.ok` branch at the top of `validateAndPrepareFileOperation` returns silently.

### Branch C — `shouldAutoApproveToolWithPath(...) = false`
Auto-approval is being denied → handler falls into manual approval flow → `config.callbacks.ask("tool", ...)` waits forever (or returns a non-`yesButtonClicked` response in headless), so the file is never saved. Check:
- `isLocatedInWorkspace(relPath)` — does it return true for `relPath` (which after validation might be `config/db.js` or might still be the absolute path)?
- `HostProvider.workspace.getWorkspacePaths()` — does it return the override `localPath`?
- `autoApprovalSettings.actions.editFiles` — is it actually `true` at the time the check runs (vs. `false` because the task settings didn't propagate)?

### Branch D — `Calling saveChanges() for <path>` appeared but `[FileEditProvider] Saving document to disk` did not
The `saveChanges()` early-returned at the guard:
```ts
if (!this.relPath || !this.absolutePath || !this.newContent || preSaveContent === undefined) {
    return { ..., finalContent: undefined }
}
```
Check which guard fired. Likely `preSaveContent === undefined` because `getDocumentText()` returned undefined. In `FileEditProvider.getDocumentText()` that means `this.documentContent` was never set, which means `open()` wasn't called or `originalContent` wasn't read. Add a log inside `FileEditProvider.getDocumentText()` and `FileEditProvider.open()` to confirm.

### Branch E — no `[WriteToFileTool] ▶ execute called` at all
The AI didn't call `write_to_file`. Check the `lastMessages` field in the `/status` endpoint output (already exposed). The AI probably called only `attempt_completion` and decided no edit was needed — this is the false-positive case. Tighten the prompt in `codeReviewRoutes.ts` autofix POST handler.

---

## REPO LOCATIONS (absolute)

- Backend server entry: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\src\villa-server.ts` (port 3004, `npm run dev`)
- Autofix route: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\src\core\controller\codeReviewRoutes.ts`
- WriteToFileToolHandler: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\src\core\task\tools\handlers\WriteToFileToolHandler.ts`
- Task constructor: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\src\core\task\index.ts` (around line 325 — DiffViewProvider selection)
- FileEditProvider: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\src\integrations\editor\FileEditProvider.ts`
- ExternalDiffViewProvider: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\src\hosts\external\ExternalDiffviewProvider.ts`
- AutoApprove: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\src\core\task\tools\autoApprove.ts`
- Test repo on disk: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\.villa-repos\joModes-1_chatapp-backend_1775722589874\`
- Test script: `C:\Users\USER\Downloads\ClineMainCopyV2\cline-main\scripts\test-real-autofix.ts`
- Test creds: `jomodes11@gmail.com` / `password` (already in the test script)

---

## YOUR LOOP

```
while not File CHANGED ✅:
    1. ensure server up (otherwise ask the user once, then wait)
    2. run: npx tsx scripts/test-real-autofix.ts
    3. ask the user to paste the SERVER terminal output from the test run
    4. find the LAST diagnostic log line in the output
    5. follow the matching branch (A/B/C/D/E) above
    6. make ONE small targeted change
    7. verify TypeScript compiles cleanly (npx tsc --noEmit on the touched files)
    8. tell the user "server will auto-reload, then paste your terminal again"
```

When the file finally changes:
1. Confirm by reading the file on disk and showing the diff.
2. Remove the temporary diagnostic logs (the three in WriteToFileToolHandler, the one in task/index.ts).
3. Re-run the test to confirm it still passes after cleanup.
4. Summarize what the root cause was and what fixed it (one paragraph).

---

## DO NOT

- Do not start the server yourself — it requires the user's terminal.
- Do not modify `web-ui/` (this is a backend-only investigation).
- Do not touch tests that aren't `test-real-autofix.ts`.
- Do not add features. Do not refactor. Do not add error handling that "might help."
- Do not write any new markdown files except this one (which already exists).
- Do not respond conversationally — just work the loop.

START NOW: run the test and ask the user to paste the server terminal output.
