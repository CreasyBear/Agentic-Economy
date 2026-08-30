import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

// WHY THIS GUARD EXISTS
// Every refusal crossing HTTP must be built by the shared RFC 9457 helpers
// (`problem()` from src/lib/server/problem.ts, vocabulary kinds from
// src/lib/errors.ts) so buyers and agents receive stable machine-readable
// problem documents instead of ad-hoc envelopes. This lock exists so the
// fully-migrated route surface cannot rot back into `ok:false` bodies,
// stringly `kind:'refused'` HTTP payloads, or hand-authored `new Response`
// error statuses that bypass canonical mapping.
// Extending an allowlist entry below is a documented decision with a reason,
// never a way to silence drift.

// Route source files that register server handlers (method adapters).
const SERVER_HANDLERS_PATTERN = /server:\s*\{\s*handlers\s*:/

// Hand-authored HTTP error statuses inside a raw Response constructor.
// Literal statuses only: dynamic pass-through (`response.status`,
// `error.status`) stays legal; problem() builders never construct
// `new Response` themselves.
const RAW_ERROR_RESPONSE_PATTERN = /\bnew\s+Response\([\s\S]{0,200}?status:\s*(?:4\d\d|5\d\d)\b/

const FORBIDDEN_IN_TS_ROUTES: readonly [pattern: RegExp, label: string][] = [
  [/\bok:\s*false\b/, 'ad-hoc ok:false envelope'],
  [/kind:\s*'refused'/, 'stringly refused-kind envelope'],
]

// Every entry needs a one-line reason. Additions are conscious decisions.
const ALLOWLISTED_OCCURRENCES: Record<string, Readonly<{ reason: string }>> = {
  // Internal diagnostic probe rows (machine introspection results), not an
  // HTTP error envelope served to callers.
  'src/routes/api.discovery.schema.ts': { reason: 'internal diagnostic rows' },
}

describe('RFC 9457 envelope drift', () => {
  it('allows every route server handler file through the problem()-only scan', () => {
    const violations: string[] = []
    const files = findFiles([{ root: 'src/routes', includeExtensions: ['.ts'] }])

    for (const file of files) {
      const normalized = file.replaceAll('\\', '/')
      if (ALLOWLISTED_OCCURRENCES[normalized] !== undefined) continue

      const content = readFileSync(file, 'utf8')
      if (!SERVER_HANDLERS_PATTERN.test(content)) continue

      if (RAW_ERROR_RESPONSE_PATTERN.test(content)) {
        violations.push(`${normalized}: hand-authored error status in new Response`)
        continue
      }
      for (const [pattern, label] of FORBIDDEN_IN_TS_ROUTES) {
        if (pattern.test(content)) violations.push(`${normalized}: ${label}`)
      }
    }

    expect(violations).toEqual([])
  })

  it('detector really fires on drifted vocabulary (negative proof)', () => {
    expect(RAW_ERROR_RESPONSE_PATTERN.test(
      "return new Response(JSON.stringify({ error: 'nope' }), { status: 403 })",
    )).toBe(true)
    expect(RAW_ERROR_RESPONSE_PATTERN.test(
      'return new Response(null, { status: response.status })',
    )).toBe(false)
    const okPattern = FORBIDDEN_IN_TS_ROUTES[0]?.[0]
    expect(okPattern).toBeDefined()
    expect(okPattern?.test('return { ok: false }')).toBe(true)
    expect(okPattern?.test("return problem({ status: 404 })")).toBe(false)
  })
})
