import { status } from "@grpc/grpc-js";
import { HostProvider } from "@/hosts/host-provider";
import { DiffViewProvider } from "@/integrations/editor/DiffViewProvider";
import { Logger } from "@/shared/services/Logger";
export class ExternalDiffViewProvider extends DiffViewProvider {
    activeDiffEditorId;
    async openDiffEditor() {
        if (!this.absolutePath) {
            return;
        }
        const response = await HostProvider.diff.openDiff({
            path: this.absolutePath,
            content: this.originalContent ?? "",
        });
        this.activeDiffEditorId = response.diffId;
    }
    async replaceText(content, rangeToReplace, _currentLine) {
        if (!this.activeDiffEditorId) {
            return;
        }
        await HostProvider.diff.replaceText({
            diffId: this.activeDiffEditorId,
            content: content,
            startLine: rangeToReplace.startLine,
            endLine: rangeToReplace.endLine,
        });
    }
    async truncateDocument(lineNumber) {
        if (!this.activeDiffEditorId) {
            return;
        }
        await HostProvider.diff.truncateDocument({
            diffId: this.activeDiffEditorId,
            endLine: lineNumber,
        });
    }
    async getDocumentLineCount() {
        const text = await this.getDocumentText();
        if (!text) {
            return 0;
        }
        // Count lines: split by newline, but handle trailing newline correctly
        const lines = text.split("\n");
        // If text ends with newline, split creates an extra empty string at the end
        // which represents the "line" after the final newline - this is correct line count
        return lines.length;
    }
    async saveDocument() {
        if (!this.activeDiffEditorId) {
            return false;
        }
        try {
            await HostProvider.diff.saveDocument({ diffId: this.activeDiffEditorId });
            return true;
        }
        catch (err) {
            if (err.code === status.NOT_FOUND) {
                // This can happen when the task is reloaded or the diff editor is closed. So, don't
                // consider it a real error.
                Logger.log("Diff not found:", this.activeDiffEditorId);
                return false;
            }
            else {
                throw err;
            }
        }
    }
    async scrollEditorToLine(line) {
        if (!this.activeDiffEditorId) {
            return;
        }
        await HostProvider.diff.scrollDiff({ diffId: this.activeDiffEditorId, line: line });
    }
    async scrollAnimation(_startLine, _endLine) { }
    async getDocumentText() {
        if (!this.activeDiffEditorId) {
            return undefined;
        }
        try {
            return (await HostProvider.diff.getDocumentText({ diffId: this.activeDiffEditorId })).content;
        }
        catch (err) {
            Logger.log("Error getting contents of diff editor", err);
            return undefined;
        }
    }
    async closeAllDiffViews() {
        await HostProvider.diff.closeAllDiffs({});
        this.activeDiffEditorId = undefined;
    }
    async resetDiffView() {
        this.activeDiffEditorId = undefined;
    }
}
//# sourceMappingURL=ExternalDiffviewProvider.js.map