import { isFocusChainItem } from "@shared/focus-chain-utils";
import * as fs from "fs/promises";
import * as path from "path";
import { ensureTaskDirectoryExists } from "../../storage/disk";
/**
 * Generate the standard file path for a task's focusChain markdown file
 */
export function getFocusChainFilePath(taskDir, taskId) {
    return path.join(taskDir, `focus_chain_taskid_${taskId}.md`);
}
/**
 * Create the standard markdown content structure for a focusChain file
 */
export function createFocusChainMarkdownContent(taskId, focusChainList) {
    return `# Focus Chain List for Task ${taskId}

<!-- Edit this markdown file to update your focus chain list -->
<!-- Use the format: - [ ] for incomplete items and - [x] for completed items -->

${focusChainList}

<!-- Save this file and the focus chain list will be updated in the task -->`;
}
/**
 * Extract focusChain items from text content (markdown or message text)
 * Returns array of lines that match focusChain item format
 */
export function extractFocusChainItemsFromText(text) {
    const lines = text.split("\n");
    return lines.filter((line) => {
        const trimmed = line.trim();
        return isFocusChainItem(trimmed);
    });
}
/**
 * Extract focusChain items and return as joined string, or null if no items found
 */
export function extractFocusChainListFromText(text) {
    const focusChainLines = extractFocusChainItemsFromText(text);
    return focusChainLines.length > 0 ? focusChainLines.join("\n") : null;
}
/**
 * Ensure a focusChain file exists, creating it with provided content if it doesn't exist
 * Returns the file path
 */
export async function ensureFocusChainFile(taskId, initialFocusChainContent) {
    const taskDir = await ensureTaskDirectoryExists(taskId);
    const focusChainFilePath = getFocusChainFilePath(taskDir, taskId);
    // Check if file exists
    let fileExists = false;
    try {
        await fs.access(focusChainFilePath);
        fileExists = true;
    }
    catch {
        // File doesn't exist
    }
    // Create file if it doesn't exist
    if (!fileExists) {
        const focusChainContent = initialFocusChainContent ||
            `- [ ] Example checklist item
- [ ] Another checklist item
- [x] Completed example item`;
        const fileContent = createFocusChainMarkdownContent(taskId, focusChainContent);
        await fs.writeFile(focusChainFilePath, fileContent, "utf8");
    }
    return focusChainFilePath;
}
//# sourceMappingURL=file-utils.js.map