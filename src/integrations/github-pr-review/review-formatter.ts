/**
 * Turn the validator's findings into the payload GitHub's review API wants.
 *
 *   findings  →  { inlineComments[], reviewBody, checkRunSummary, conclusion }
 *
 * Inline comments get a severity emoji and (optionally) a GitHub
 * ``` suggestion ``` block so the reviewer can click "Apply suggestion" right
 * in the GitHub UI.
 *
 * The summary is a Markdown table for the top-of-PR review comment.
 */

import type { PRReviewFinding, FindingSeverity } from './types'
import type { InlineComment, CheckRunConclusion } from './github-client'

const SEVERITY_EMOJI: Record<FindingSeverity, string> = {
  error: '🔴',
  warning: '🟡',
  info: '🔵',
}

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
}

export interface FormattedReview {
  inlineComments: InlineComment[]
  reviewBody: string
  reviewEvent: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'
  checkConclusion: CheckRunConclusion
  checkSummary: string
  checkDetails: string
}

/**
 * Group findings by file → format into one inline comment per (file, line).
 * Multiple findings on the same line are merged into a single comment with
 * a bullet list, so we don't trip GitHub's "one comment per line" UI quirk.
 */
export function formatReview(opts: {
  findingsByFile: Map<string, PRReviewFinding[]>
  totalFilesReviewed: number
  totalFilesSkipped: number
  appLabel: string                       // e.g. "Villa AI"
}): FormattedReview {
  const { findingsByFile, totalFilesReviewed, totalFilesSkipped, appLabel } = opts

  // ── Build inline comments, one per (file, line) ──
  const inlineComments: InlineComment[] = []
  const byFileLine = new Map<string, PRReviewFinding[]>()
  for (const [file, findings] of findingsByFile) {
    for (const f of findings) {
      const key = `${file}::${f.line}`
      const bucket = byFileLine.get(key) ?? []
      bucket.push(f)
      byFileLine.set(key, bucket)
    }
  }

  for (const [key, findings] of byFileLine) {
    const [path, lineStr] = key.split('::')
    const line = parseInt(lineStr, 10)
    inlineComments.push({
      path,
      line,
      body: renderInlineCommentBody(findings, appLabel),
    })
  }

  // ── Severity rollup ──
  const counts: Record<FindingSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const findings of findingsByFile.values()) {
    for (const f of findings) counts[f.severity]++
  }
  const total = counts.error + counts.warning + counts.info

  // ── Review body (top-of-PR Markdown) ──
  const lines: string[] = []
  lines.push(`## ${appLabel} Review`)
  lines.push('')
  if (total === 0) {
    lines.push(`✅ No issues found across ${totalFilesReviewed} reviewed file(s).`)
  } else {
    lines.push(`Reviewed **${totalFilesReviewed}** file(s)${totalFilesSkipped > 0 ? ` (skipped ${totalFilesSkipped})` : ''}. Found **${total}** issue(s):`)
    lines.push('')
    lines.push('| Severity | Count |')
    lines.push('|----------|------:|')
    if (counts.error)   lines.push(`| 🔴 Error   | ${counts.error}   |`)
    if (counts.warning) lines.push(`| 🟡 Warning | ${counts.warning} |`)
    if (counts.info)    lines.push(`| 🔵 Info    | ${counts.info}    |`)
    lines.push('')
    lines.push('Inline comments below highlight each issue at its location.')
  }
  lines.push('')
  lines.push(`<sub>Powered by ${appLabel}. Automated, no human reviewer.</sub>`)
  const reviewBody = lines.join('\n')

  // ── Check run summary + details (shorter form for the check UI) ──
  const checkSummary =
    total === 0
      ? `✅ Passed — no issues across ${totalFilesReviewed} file(s).`
      : `Found ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info across ${totalFilesReviewed} file(s).`

  const checkDetailsLines: string[] = []
  for (const [file, findings] of findingsByFile) {
    checkDetailsLines.push(`### \`${file}\``)
    for (const f of findings) {
      checkDetailsLines.push(`- ${SEVERITY_EMOJI[f.severity]} **L${f.line}** ${f.message}${f.ruleId ? `  _(${f.ruleId})_` : ''}`)
    }
    checkDetailsLines.push('')
  }
  const checkDetails = checkDetailsLines.join('\n')

  // ── Conclusion mapping ──
  //   any error  → failure  (status check goes red, blocks merge if branch protection is set)
  //   warnings   → neutral  (yellow, doesn't block)
  //   nothing    → success  (green ✓)
  const checkConclusion: CheckRunConclusion =
    counts.error > 0 ? 'failure' : counts.warning > 0 ? 'neutral' : 'success'

  // We post a REQUEST_CHANGES review when there are errors — this is what
  // gets the reviewer's attention and (with branch protection) blocks merge.
  // Warnings/info only → COMMENT review (non-blocking).
  const reviewEvent: 'COMMENT' | 'REQUEST_CHANGES' =
    counts.error > 0 ? 'REQUEST_CHANGES' : 'COMMENT'

  return { inlineComments, reviewBody, reviewEvent, checkConclusion, checkSummary, checkDetails }
}

function renderInlineCommentBody(findings: PRReviewFinding[], appLabel: string): string {
  if (findings.length === 1) return renderSingleFinding(findings[0], appLabel)
  // Multiple findings on the same line → bullet them.
  const out: string[] = [`**${appLabel}** flagged ${findings.length} issues on this line:`]
  for (const f of findings) {
    out.push('')
    out.push(`- ${SEVERITY_EMOJI[f.severity]} **${SEVERITY_LABEL[f.severity]}** — ${f.message}${f.ruleId ? `  _(${f.ruleId})_` : ''}`)
    if (f.description) out.push(`  ${f.description}`)
    if (f.storeRule) out.push(`  _Store policy:_ ${f.storeRule}`)
  }
  // If exactly one finding has a suggestion block, attach it after the bullets.
  const withSuggestion = findings.find((f) => typeof f.suggestion === 'string' && f.suggestion.length > 0)
  if (withSuggestion?.suggestion) {
    out.push('')
    out.push('```suggestion')
    out.push(withSuggestion.suggestion)
    out.push('```')
  }
  return out.join('\n')
}

function renderSingleFinding(f: PRReviewFinding, appLabel: string): string {
  const parts: string[] = []
  parts.push(`${SEVERITY_EMOJI[f.severity]} **${SEVERITY_LABEL[f.severity]}** — ${f.message}`)
  if (f.ruleId) parts.push(`_${f.ruleId}_`)
  if (f.description) parts.push(f.description)
  if (f.storeRule) parts.push(`**Store policy:** ${f.storeRule}`)
  parts.push(`<sub>— ${appLabel}</sub>`)
  let body = parts.join('\n\n')
  if (f.suggestion) {
    body += '\n\n```suggestion\n' + f.suggestion + '\n```'
  }
  return body
}
