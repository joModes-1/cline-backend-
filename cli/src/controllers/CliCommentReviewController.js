/**
 * CLI-specific CommentReviewController implementation
 * Handles code review comments in CLI mode
 */
import { CommentReviewController } from "@/integrations/editor/CommentReviewController";
import { print, style } from "../utils/display";
export class CliCommentReviewController extends CommentReviewController {
    comments = new Map();
    streamingComment = null;
    setOnReplyCallback(_callback) {
        // No-op - CLI doesn't support interactive replies
    }
    async ensureCommentsViewDisabled() {
        // No-op - no comments view in CLI
    }
    addReviewComment(comment) {
        const key = `${comment.filePath}:${comment.startLine}:${comment.endLine}`;
        const existing = this.comments.get(key) || [];
        existing.push(comment.comment);
        this.comments.set(key, existing);
        print(style.info(`Comment on ${comment.filePath}:${comment.startLine + 1}`));
        print(style.dim(`   ${comment.comment}`));
    }
    startStreamingComment(filePath, startLine, endLine, _relativePath, _fileContent, _revealComment) {
        this.streamingComment = { filePath, startLine, endLine, content: "" };
        print(style.info(`Comment on ${filePath}:${startLine + 1}`));
    }
    appendToStreamingComment(chunk) {
        if (this.streamingComment) {
            this.streamingComment.content += chunk;
            process.stdout.write(chunk);
        }
    }
    endStreamingComment() {
        if (this.streamingComment) {
            const key = `${this.streamingComment.filePath}:${this.streamingComment.startLine}:${this.streamingComment.endLine}`;
            const existing = this.comments.get(key) || [];
            existing.push(this.streamingComment.content);
            this.comments.set(key, existing);
            print(""); // newline after streaming
            this.streamingComment = null;
        }
    }
    addReviewComments(comments) {
        for (const comment of comments) {
            this.addReviewComment(comment);
        }
    }
    clearAllComments() {
        this.comments.clear();
    }
    clearCommentsForFile(filePath) {
        for (const key of this.comments.keys()) {
            if (key.startsWith(filePath)) {
                this.comments.delete(key);
            }
        }
    }
    getThreadCount() {
        return this.comments.size;
    }
    async closeDiffViews() {
        // No-op - no diff views in CLI
    }
    dispose() {
        this.comments.clear();
        this.streamingComment = null;
    }
}
//# sourceMappingURL=CliCommentReviewController.js.map