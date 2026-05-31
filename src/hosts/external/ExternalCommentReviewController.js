import { CommentReviewController } from "@/integrations/editor/CommentReviewController";
/**
 * External (non-VS Code) implementation of CommentReviewController.
 *
 * This is a no-op implementation for platforms that don't support
 * inline code comments (e.g., JetBrains, CLI).
 */
export class ExternalCommentReviewController extends CommentReviewController {
    setOnReplyCallback(_callback) {
        // No-op
    }
    async ensureCommentsViewDisabled() {
        // No-op
    }
    addReviewComment(_comment) {
        // No-op
    }
    startStreamingComment(_filePath, _startLine, _endLine, _relativePath, _fileContent, _revealComment) {
        // No-op
    }
    appendToStreamingComment(_chunk) {
        // No-op
    }
    endStreamingComment() {
        // No-op
    }
    addReviewComments(_comments) {
        // No-op
    }
    clearAllComments() {
        // No-op
    }
    clearCommentsForFile(_filePath) {
        // No-op
    }
    getThreadCount() {
        return 0;
    }
    async closeDiffViews() {
        // No-op
    }
    dispose() {
        // No-op
    }
}
//# sourceMappingURL=ExternalCommentReviewController.js.map