import { describe, expect, it } from 'vitest'

import {
  scanCopyVocabulary,
  type CopyVocabularyRule,
} from '@/lib/ui/contract-scans/copy-vocabulary'
import type { ScanTarget, ScanViolation } from '@/lib/ui/contract-scans/file-discovery'

import { fixtureTargets, isFixtureMode } from './scan-targets'

const COPY_RULES = [
  { id: 'supplier', pattern: /\bSupplier\b/, replacement: 'Provider' },
  { id: 'invocation', pattern: /\bInvocation\b/, replacement: 'Call' },
  { id: 'mandate', pattern: /\bMandate\b/, replacement: 'Spending policy' },
  { id: 'commitment', pattern: /\bCommitment\b/, replacement: 'Quote' },
  { id: 'callable-operation', pattern: /\bCallable Operation\b/, replacement: 'Tool' },
  {
    id: 'commercial-closure',
    pattern: /\bCommercial closure\b/,
    replacement: 'Purchase resolution',
  },
  { id: 'legacy-credential', pattern: /\bLegacy credential\b/, replacement: 'Direct key' },
  {
    id: 'used-recently',
    pattern: /\bUsed recently by other agents\b/,
    replacement: 'remove or show a count',
  },
  { id: 'one-call-away', pattern: /\bone Call away\b/, replacement: 'remove' },
  { id: 'connection-online', pattern: /\bConnection online\b/, replacement: 'remove' },
  { id: 'authority-mode', pattern: /\bAuthority mode\b/, replacement: 'Spending policy' },
  { id: 'balance', pattern: /\bBalance\b/, replacement: 'Credit' },
] as const satisfies readonly CopyVocabularyRule[]

type CopyRuleId = (typeof COPY_RULES)[number]['id']

// pinned 2026-09-21 from first run; may only decrease
const COPY_CEILINGS: Record<CopyRuleId, number> = {
  supplier: 0,
  invocation: 1,
  mandate: 0,
  commitment: 0,
  'callable-operation': 0,
  'commercial-closure': 0,
  'legacy-credential': 2,
  'used-recently': 1,
  'one-call-away': 1,
  'connection-online': 2,
  'authority-mode': 1,
  balance: 17,
}

const COPY_CEILING_MARGIN = 2
const FIXTURE_ROOT = 'tests/fixtures/quality-gates/copy-vocabulary'

const CLEAN_TARGETS: readonly ScanTarget[] = [
  { root: 'src/components', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/routes', includeExtensions: ['.tsx'] },
  { root: 'src/content', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/lib/public', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/modules', includeExtensions: ['.view-model.ts', '.contracts.ts'] },
]

describe('copy vocabulary ratchet', () => {
  it('keeps customer-facing vocabulary on canonical terms', () => {
    const violations = scanCopyVocabulary(
      isFixtureMode() ? fixtureTargets(FIXTURE_ROOT) : CLEAN_TARGETS,
      COPY_RULES,
    )
    const actualByRule = countByRule(violations)

    if (isFixtureMode()) {
      expect(actualByRule.supplier).toBe(1)
      expect(actualByRule.invocation).toBe(1)
      expect(actualByRule['connection-online']).toBe(1)
      expect(violations).toHaveLength(3)
      return
    }

    for (const rule of COPY_RULES) {
      const actual = actualByRule[rule.id]
      const matches = formatMatches(violations.filter((violation) => violation.rule === rule.id))
      expect.soft(
        actual,
        `Found ${actual} ${rule.id} copy match(es), ceiling is ${COPY_CEILINGS[rule.id]}.\n${matches}`,
      ).toBeLessThanOrEqual(COPY_CEILINGS[rule.id])
      expect.soft(
        COPY_CEILINGS[rule.id] - actual,
        `Lower COPY_CEILINGS.${rule.id} in tests/imports/copy-vocabulary.test.ts to ${actual}`,
      ).toBeLessThanOrEqual(COPY_CEILING_MARGIN)
    }
  })
})

function countByRule(violations: readonly ScanViolation[]): Record<CopyRuleId, number> {
  const counts = Object.fromEntries(COPY_RULES.map((rule) => [rule.id, 0])) as Record<
    CopyRuleId,
    number
  >
  for (const violation of violations) counts[violation.rule as CopyRuleId] += 1
  return counts
}

function formatMatches(violations: readonly ScanViolation[]): string {
  if (violations.length === 0) return '(no matches)'
  return violations
    .map(
      (violation) =>
        `${violation.file}:${violation.line} "${violation.excerpt}" → ${violation.message}`,
    )
    .join('\n')
}
