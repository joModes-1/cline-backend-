/**
 * Villa-specific adapter: turns the existing per-file AI code-review
 * pipeline (VillaCodeReviewService.reviewFile) into the ValidateFn shape
 * the portable GitHub PR module expects.
 *
 * This file is INTENTIONALLY OUTSIDE the github-pr-review/ directory so
 * copying that module to another project doesn't drag Villa internals
 * along. The other project writes its own adapter.
 */

import type { Controller } from './core/controller'
import { VillaCodeReviewService } from './services/codeReview/VillaCodeReviewService'
import type {
  ValidateFn,
  ValidateInput,
  PRReviewFinding,
  FindingSeverity,
} from './integrations/github-pr-review'

/**
 * Build a ValidateFn that runs the same compliance prompt Villa uses for
 * the /validate endpoint, scoped to a single file. PR-review needs per-file
 * findings with line numbers, which is exactly what VillaCodeReviewService
 * already produces.
 *
 * The PR pipeline calls this once per changed file. We filter findings to
 * the PR's changed lines so we don't comment on pre-existing issues that
 * the PR didn't introduce — that's the CodeRabbit-style behaviour.
 */
export function createVillaPRValidator(controller: Controller): ValidateFn {
  const codeReviewService = new VillaCodeReviewService(controller, controller.stateManager)

  return async (input: ValidateInput): Promise<PRReviewFinding[]> => {
    const result = await codeReviewService.reviewFile({
      content: input.content,
      fileName: input.path,
    })

    const findings: PRReviewFinding[] = []
    for (const issue of result.issues) {
      // Compliance reviewer returns "error" | "warning" | "info" | "hint".
      // Map hint → info for the PR module's narrower type.
      const sev: FindingSeverity =
        issue.severity === 'error' ? 'error'
        : issue.severity === 'warning' ? 'warning'
        : 'info'

      findings.push({
        id: issue.id,
        message: issue.message,
        severity: sev,
        line: issue.line || 1,
        column: issue.column,
        ruleId: issue.ruleId,
        category: (issue as any).category,
        storeRule: (issue as any).storeRule,
        description: (issue as any).description,
        suggestion: issue.suggestedFix?.replacement,
      })
    }

    // Optional: drop findings on lines NOT changed by this PR. That gives
    // the CodeRabbit "only comment on what you changed" feel. Comment out
    // the next two lines to get whole-file feedback.
    if (input.changedLines.length > 0) {
      return findings.filter((f) => input.changedLines.includes(f.line))
    }
    return findings
  }
}
