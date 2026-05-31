/**
 * OSV.dev — free public vulnerability database.
 *
 * Single client used by every ecosystem-specific parser (npm, Pub/Flutter,
 * Maven/Gradle, RubyGems, PyPI, …). Replaces the hardcoded "deprecated
 * package" lists that scattered across audit rules.
 *
 * Public endpoint, no API key, no auth.
 *   https://api.osv.dev/v1/query
 *
 * The endpoint expects:
 *   { "package": { "name": "<name>", "ecosystem": "<ecosystem>" },
 *     "version": "<exact-version>" }
 *
 * Ecosystem identifiers — see https://ossf.github.io/osv-schema/#affectedpackage-field
 */

export type OsvEcosystem = 'npm' | 'Pub' | 'Maven' | 'RubyGems' | 'PyPI' | 'Go' | 'crates.io'

export interface OsvVuln {
  id: string
  summary?: string
  severity?: { type: string; score: string }[]
  database_specific?: { severity?: string }
  affected?: { ranges?: { events?: { fixed?: string }[] }[] }[]
  references?: { url: string }[]
}

export interface DependencyVuln {
  name: string
  version: string
  spec: string                    // original spec from manifest, e.g. "^2.0.1"
  severity: 'BLOCKER' | 'WARNING' | 'INFO'
  vulnId: string                  // primary OSV id
  summary: string                 // <= 200 chars
  fixedIn?: string                // earliest patched version, if known
  totalVulns: number              // total CVEs found for this version
}

const OSV_URL = 'https://api.osv.dev/v1/query'
const OSV_TIMEOUT_MS = 4000
const OSV_CONCURRENCY = 6

/**
 * Normalise a manifest version spec to something OSV accepts.
 * OSV needs an EXACT version, so we strip range operators / prereleases.
 */
export function normalizeVersionSpec(spec: string): string | null {
  const cleaned = spec.trim().replace(/^[~^=v>]+\s*/, '').split(/[\s|]/)[0]
  if (!/^\d/.test(cleaned)) return null
  return cleaned.split('-')[0]
}

async function postOsv(body: object, signal: AbortSignal): Promise<OsvVuln[]> {
  const res = await fetch(OSV_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) return []
  const data = (await res.json()) as { vulns?: OsvVuln[] }
  return data.vulns ?? []
}

/**
 * Query OSV for one (ecosystem, name, version) combo. Returns the list of
 * vulnerabilities OSV knows about for that exact version. Empty array on
 * timeout or any network error — audit MUST NOT fail because OSV is down.
 */
export async function queryOsv(
  ecosystem: OsvEcosystem,
  name: string,
  version: string,
): Promise<OsvVuln[]> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), OSV_TIMEOUT_MS)
  try {
    return await postOsv(
      { package: { name, ecosystem }, version },
      ctrl.signal,
    )
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

/**
 * Severity ranking — used when a package has multiple CVEs to surface the
 * worst one (the audit collapses to one finding per dep to avoid spam).
 */
function severityOf(v: OsvVuln): 'BLOCKER' | 'WARNING' | 'INFO' {
  const cvss = v.severity?.find((s) => s.type === 'CVSS_V3')?.score ?? ''
  const dbSev = (v.database_specific?.severity ?? '').toUpperCase()
  if (dbSev === 'CRITICAL' || /^CVSS:.*\/(9|10)\./.test(cvss)) return 'BLOCKER'
  if (dbSev === 'HIGH' || dbSev === 'MODERATE' || /^CVSS:.*\/(7|8)\./.test(cvss)) return 'WARNING'
  return 'INFO'
}

function pickWorst(vulns: OsvVuln[]): { vuln: OsvVuln; severity: 'BLOCKER' | 'WARNING' | 'INFO' } | null {
  if (vulns.length === 0) return null
  const ranked = vulns.map((v) => ({ vuln: v, severity: severityOf(v) }))
  const order = { BLOCKER: 0, WARNING: 1, INFO: 2 }
  ranked.sort((a, b) => order[a.severity] - order[b.severity])
  return ranked[0]
}

/**
 * For each dependency, query OSV. Returns one DependencyVuln per VULNERABLE
 * dep (deps with no known vulnerabilities are omitted from the result).
 *
 * Concurrency-capped at OSV_CONCURRENCY so we don't flood the public endpoint
 * on big monorepos. Caller decides what to do with the result.
 *
 * Set env `VILLA_AUDIT_OSV_DISABLED=true` to short-circuit the lookup —
 * useful in offline tests / CI where outbound HTTP is undesirable.
 */
export async function checkDependencies(
  ecosystem: OsvEcosystem,
  deps: Record<string, string>,
): Promise<DependencyVuln[]> {
  if (process.env.VILLA_AUDIT_OSV_DISABLED === 'true') return []

  const entries = Object.entries(deps)
  const out: DependencyVuln[] = []
  for (let i = 0; i < entries.length; i += OSV_CONCURRENCY) {
    const batch = entries.slice(i, i + OSV_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async ([name, spec]) => {
        const version = normalizeVersionSpec(spec)
        if (!version) return null
        const vulns = await queryOsv(ecosystem, name, version)
        const worst = pickWorst(vulns)
        if (!worst) return null
        const fixedIn = worst.vuln.affected?.[0]?.ranges?.[0]?.events?.find((e) => e.fixed)?.fixed
        return {
          name,
          version,
          spec,
          severity: worst.severity,
          vulnId: worst.vuln.id,
          summary: (worst.vuln.summary ?? worst.vuln.id).slice(0, 200),
          fixedIn,
          totalVulns: vulns.length,
        } as DependencyVuln
      }),
    )
    for (const r of results) if (r) out.push(r)
  }
  return out
}
