/**
 * Shared freshness vocabulary (review issue 4A / C16): one shape, reused by
 * every source that reports "how current is this projection" - the x402
 * directory index (`x402-directory-index.server.ts`) and the hourly
 * business-supply-projection sweep read by market-tools list/search
 * (`registry/tools.actions.ts`). `common` has no dependencies, so both
 * `registry` and `market` can import this without crossing the module
 * boundary that forbids `registry -> market`.
 */
export type SourceFreshnessState = 'absent' | 'failed' | 'stale' | 'fresh'

/** One 36 h missed-refresh window before the x402 directory index is considered stale. */
export const CATALOGUE_STALE_AFTER_MS = 36 * 60 * 60 * 1000

/** Pure threshold logic: absent with no completion, failed when the source says so, else stale/fresh by age. */
export function sourceFreshnessState(
  input: Readonly<{ completedAt?: number; failed?: boolean }>,
  staleAfterMs: number,
  now: number,
): SourceFreshnessState {
  if (input.completedAt === undefined) return 'absent'
  if (input.failed === true) return 'failed'
  return now - input.completedAt > staleAfterMs ? 'stale' : 'fresh'
}
