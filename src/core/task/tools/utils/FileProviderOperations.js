/**
 * Utility class for file operations via a DiffViewProvider
 */
export class FileProviderOperations {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async openFile(path) {
        await this.provider.open(path);
    }
    /**
     * Saves the current changes and returns the result.
     */
    async saveChanges() {
        const result = await this.provider.saveChanges();
        return result;
    }
    /**
     * Creates a file. If isFinal is false, prepares the creation without saving.
     * Call saveChanges() after approval when isFinal is false.
     */
    async createFile(path, content, isFinal = true) {
        this.provider.editType = "create";
        await this.openFile(path);
        // Always pass isFinal=true to update() to ensure proper document finalization
        // (extends replacement range to full document, truncates trailing content).
        // The isFinal parameter here only controls whether to save after the update.
        await this.provider.update(content, true);
        if (isFinal) {
            return await this.saveChanges();
        }
        return undefined;
    }
    /**
     * Modifies a file. If isFinal is false, prepares the modification without saving.
     * Call saveChanges() after approval when isFinal is false.
     */
    async modifyFile(path, content, isFinal = true) {
        this.provider.editType = "modify";
        await this.openFile(path);
        // Always pass isFinal=true to update() to ensure proper document finalization
        // (extends replacement range to full document, truncates trailing content).
        // The isFinal parameter here only controls whether to save after the update.
        await this.provider.update(content, true);
        if (isFinal) {
            return await this.saveChanges();
        }
        return undefined;
    }
    /**
     * Deletes a file. If isFinal is false, prepares the deletion without actually deleting.
     * Opens the file in the diff view to show it will be deleted.
     * Call deleteFile() with isFinal=true after approval when isFinal is false.
     */
    async deleteFile(path, isFinal = true) {
        this.provider.editType = "delete";
        await this.openFile(path);
        if (isFinal) {
            await this.provider.deleteFile(path);
            return undefined;
        }
        else {
            // Update with empty content to show the file will be deleted
            // Always pass isFinal=true to update() to ensure proper document finalization
            await this.provider.update("", true);
            return undefined;
        }
    }
    /**
     * Moves a file from oldPath to newPath. If isFinal is false, prepares the move without saving.
     * Call saveChanges() after approval when isFinal is false.
     */
    async moveFile(oldPath, newPath, content, isFinal = true) {
        if (isFinal) {
            const result = await this.createFile(newPath, content, isFinal);
            await this.deleteFile(oldPath, isFinal);
            return result;
        }
        else {
            await this.createFile(newPath, content, isFinal);
            await this.deleteFile(oldPath, isFinal);
            return undefined;
        }
    }
    async getFileContent() {
        return this.provider.originalContent;
    }
}
//# sourceMappingURL=FileProviderOperations.js.map