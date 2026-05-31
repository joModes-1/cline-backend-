import { DiffViewProvider } from "@integrations/editor/DiffViewProvider";
import * as fs from "fs/promises";
import { Logger } from "@/shared/services/Logger";
/**
 * A file-system-based implementation of DiffViewProvider that performs direct file operations
 * without visual editor integration. This provider uses the Node.js fs package to handle
 * file edits in-memory and then writes them to disk.
 *
 * Visual operations like scrolling are implemented as no-ops since there is no UI component.
 * This makes it suitable for headless or non-interactive environments.
 */
export class FileEditProvider extends DiffViewProvider {
    documentContent;
    constructor() {
        super();
    }
    showFile(_absolutePath) {
        // No-op: No visual editor to show the file
        return Promise.resolve();
    }
    async openDiffEditor() {
        // No-op: No visual editor to open in a file-system-only provider
        // The file content is already loaded in the base class's open() method
        this.documentContent = this.originalContent || "";
    }
    async open(relPath, options) {
        await super.open(relPath, options);
        this.documentContent = this.originalContent || "";
    }
    async replaceText(content, rangeToReplace, _currentLine) {
        if (this.documentContent === undefined) {
            throw new Error("Document not initialized");
        }
        // Split the document into lines
        const lines = this.documentContent.split("\n");
        // Check if we're replacing to the end of the document
        const replacingToEnd = rangeToReplace.endLine >= lines.length;
        // Replace the specified range with the new content
        const newContentLines = content.split("\n");
        // Remove trailing empty line for proper splicing, BUT only when NOT replacing
        // to the end of the document. When replacing to the end, keep the trailing
        // empty string to preserve trailing newlines from the content.
        if (!replacingToEnd && newContentLines[newContentLines.length - 1] === "") {
            newContentLines.pop();
        }
        // Splice the lines array to replace the range
        lines.splice(rangeToReplace.startLine, rangeToReplace.endLine - rangeToReplace.startLine, ...newContentLines);
        // Join the lines back together
        this.documentContent = lines.join("\n");
    }
    async scrollEditorToLine(_line) {
        // No-op: No visual editor to scroll
    }
    async scrollAnimation(_startLine, _endLine) {
        // No-op: No visual editor to animate
    }
    async truncateDocument(lineNumber) {
        if (!this.documentContent) {
            return;
        }
        // Split the document into lines and keep only up to lineNumber
        const lines = this.documentContent.split("\n");
        if (lineNumber < lines.length) {
            this.documentContent = lines.slice(0, lineNumber).join("\n");
        }
    }
    async getDocumentLineCount() {
        if (!this.documentContent) {
            return 0;
        }
        return this.documentContent.split("\n").length;
    }
    async getDocumentText() {
        return this.documentContent;
    }
    /**
     * Public method to get the current document content.
     * This is exposed for use by tools that need to read the document state.
     */
    async getContent() {
        return this.getDocumentText();
    }
    async saveDocument() {
        if (!this.absolutePath) {
            throw new Error("[FileEditProvider] Cannot save: absolutePath is not set");
        }
        if (this.documentContent === undefined) {
            throw new Error(`[FileEditProvider] Cannot save: documentContent is undefined for ${this.absolutePath}`);
        }
        Logger.info(`[FileEditProvider] Saving document to disk: ${this.absolutePath} (chars=${this.documentContent.length})`);
        // Always use UTF-8 for writing - it's the modern standard and handles all characters
        // including emojis. The detected fileEncoding was used for reading to preserve
        // compatibility, but writing as UTF-8 ensures no character corruption.
        await fs.writeFile(this.absolutePath, this.documentContent, { encoding: "utf8" });
        // Verify the write actually landed on disk — stat failure here means the write didn't persist.
        const stat = await fs.stat(this.absolutePath);
        Logger.info(`[FileEditProvider] Save complete: ${this.absolutePath} (bytes=${stat.size})`);
        return true;
    }
    async closeAllDiffViews() {
        // No-op: No visual diff views to close
    }
    async resetDiffView() {
        // Clean up the in-memory document content
        this.documentContent = undefined;
    }
}
//# sourceMappingURL=FileEditProvider.js.map