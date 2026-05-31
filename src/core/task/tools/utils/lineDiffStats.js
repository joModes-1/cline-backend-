import * as diff from "diff";
/**
 * Count the number of lines in a diff hunk value.
 * Handles trailing newlines correctly (diffLines includes them in the value).
 */
function countLines(value) {
    if (!value)
        return 0;
    // diffLines values end with \n, so split produces a trailing empty string
    const lines = value.split("\n");
    return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}
/**
 * Calculate line diff stats between before and after content using Myers diff.
 *
 * Adjacent remove+add hunks are paired as "changed" lines (min of the two),
 * with the remainder counted as pure adds or deletes.
 *
 * @param before - The original file content (empty string for new files)
 * @param after - The new file content (empty string for deleted files)
 * @returns LineDiffStats with counts of added, deleted, and changed lines
 */
export function computeLineDiffStats(before, after) {
    // Normalize trailing newlines so diffLines doesn't treat last-line boundary shifts as changes
    const normBefore = before ? (before.endsWith("\n") ? before : before + "\n") : "";
    const normAfter = after ? (after.endsWith("\n") ? after : after + "\n") : "";
    const changes = diff.diffLines(normBefore, normAfter);
    let linesAdded = 0;
    let linesDeleted = 0;
    let linesChanged = 0;
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (change.removed) {
            const removedCount = countLines(change.value);
            const next = i + 1 < changes.length ? changes[i + 1] : undefined;
            // Pair adjacent remove+add as "changed"
            if (next?.added) {
                const addedCount = countLines(next.value);
                const paired = Math.min(removedCount, addedCount);
                linesChanged += paired;
                linesDeleted += removedCount - paired;
                linesAdded += addedCount - paired;
                i++; // skip the paired add hunk
            }
            else {
                linesDeleted += removedCount;
            }
        }
        else if (change.added) {
            linesAdded += countLines(change.value);
        }
        // unchanged hunks are ignored
    }
    return { linesAdded, linesDeleted, linesChanged };
}
//# sourceMappingURL=lineDiffStats.js.map