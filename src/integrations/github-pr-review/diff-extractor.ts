/**
 * Unified-diff parser → set of "commentable" lines per file.
 *
 * GitHub's PR review API only accepts inline comments on lines that appear
 * in the diff (either added/+ or context lines around them). Posting a
 * comment on a line outside the diff makes GitHub reject the ENTIRE review,
 * not just the bad comment — so we must filter our findings.
 *
 * We parse the `patch` field GitHub returns per file in
 *   GET /repos/:o/:r/pulls/:n/files
 * which is a unified diff hunk like:
 *
 *   @@ -10,7 +10,9 @@ function foo() {
 *      const a = 1
 *   -  const b = 2
 *   +  const b = 3
 *   +  const c = 4
 *
 * For each hunk we track the running NEW-file line number; lines starting
 * with '+' or ' ' (context) are commentable. Lines starting with '-' are
 * in the OLD file only and we skip them.
 */

export interface CommentableRange {
  /** Lines (1-indexed in the NEW file) that can carry an inline comment. */
  lines: Set<number>
  /** Lines that were ADDED (subset of `lines`). Useful for "comment only on new code". */
  added: Set<number>
}

/**
 * Parse a `patch` string for one file.
 *
 * @returns {CommentableRange} — empty if the patch is missing or malformed.
 */
export function extractCommentableLines(patch: string | undefined): CommentableRange {
  const lines = new Set<number>()
  const added = new Set<number>()
  if (!patch) return { lines, added }

  let newLineNum = 0
  for (const rawLine of patch.split('\n')) {
    if (rawLine.startsWith('@@')) {
      // Hunk header: @@ -oldStart,oldLen +newStart,newLen @@
      const m = /\+(\d+)(?:,(\d+))?/.exec(rawLine)
      if (m) {
        newLineNum = parseInt(m[1], 10) - 1   // -1 because we increment BEFORE marking
      }
      continue
    }
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      newLineNum++
      lines.add(newLineNum)
      added.add(newLineNum)
    } else if (rawLine.startsWith(' ')) {
      newLineNum++
      lines.add(newLineNum)
    } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      // Line removed from OLD file — no new-file line number, skip.
    }
    // Other lines ("\ No newline at end of file", file headers) are ignored.
  }

  return { lines, added }
}
