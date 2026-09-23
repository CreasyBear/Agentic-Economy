import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  FICTIONAL_STRING_REFERENCE_ALLOWLIST,
  scanConvexApiSurfaceFromSources,
  scanStringConvexReferences,
  validateStringReferencesAgainstSurface,
} from '../helpers/convex-rpc-contract-scans'

/**
 * Guard 2 — string-literal Convex reference ratchet.
 *
 * Scans `src/`, `convex/`, and `tests/` for static references passed to:
 * - `makeFunctionReference` (from `convex/server`)
 * - `sourceQuery`, `sourceMutation`, `sourceAction` (from `@/lib/server/convex-source`)
 *
 * No other string-literal Convex reference helpers were found in those roots.
 * Related production code also uses typed `api.*` / `internal.*` paths (not covered here).
 * Release smoke scripts under `tools/release/` also call `sourceQuery` / `sourceMutation`
 * but are outside this ratchet scope.
 *
 * Literals may use `module:method` or `module.method`. Module-level `const` string
 * aliases in the same file are resolved before matching.
 *
 * Updating skipped-outside-api entries is only correct when the reference targets
 * an intentional isolated convex-test fixture module, not production API drift.
 */
const SKIPPED_OUTSIDE_API_FIXTURE = 'tests/fixtures/convex-string-reference-skipped-outside-api.json'

const REPORTED_STRING_REFERENCE_HELPERS = [
  'makeFunctionReference',
  'sourceQuery',
  'sourceMutation',
  'sourceAction',
] as const

describe('convex string reference ratchet', () => {
  it('documents the string-reference helpers under guard', () => {
    expect(REPORTED_STRING_REFERENCE_HELPERS).toEqual([
      'makeFunctionReference',
      'sourceQuery',
      'sourceMutation',
      'sourceAction',
    ])
  })

  it('keeps every static string reference aligned with generated API kinds', () => {
    const surface = scanConvexApiSurfaceFromSources()
    const scan = scanStringConvexReferences()
    const validation = validateStringReferencesAgainstSurface(surface, scan)

    expect(scan.unresolved).toEqual([])
    expect(validation.violations).toEqual([])

    const skippedOutside = validation.skippedOutsideGeneratedApi
      .map((reference) => ({
        file: reference.file,
        line: reference.line,
        literal: reference.literal,
        helper: reference.helper,
      }))
      .sort((left, right) =>
        left.file.localeCompare(right.file)
        || left.line - right.line
        || left.literal.localeCompare(right.literal),
      )
    expect(skippedOutside).toEqual(JSON.parse(readFileSync(SKIPPED_OUTSIDE_API_FIXTURE, 'utf8')))

    const fictional = [...FICTIONAL_STRING_REFERENCE_ALLOWLIST].sort()
    expect(fictional).toEqual([
      'test:must-not-run',
      'test:mutation',
      'test:query',
      'undeclared:mutation',
    ])
    expect([...new Set(validation.skippedFictional.map((reference) => reference.literal))].sort()).toEqual(fictional)
    expect(validation.skippedFictional).toHaveLength(5)
  }, 15_000)
})
