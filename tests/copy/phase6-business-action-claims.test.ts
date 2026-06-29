import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanCopyClaims, scanSourceMining } from '@/lib/ui/contract-scans'

const phase6OwnedCopyExamples = [
  {
    label: 'planning context',
    relativeFile: '.planning/phases/06-agentic-business-action-receipts/06-demo.fixture',
    copy: 'Phase 6 Business Action Card and Capability Request copy names the authorization checkpoint, GuardrailDecisionEvidence, ExternalEvidenceEvent, Action Receipt, receipt-backed software operation, receipt-backed autonomous business operation, and Hermes-run paid intake provisioning as source-owned proof only.',
  },
  {
    label: 'business-action module context',
    relativeFile: 'src/modules/business-action/public.fixture',
    copy: 'Business Action Card readback keeps Capability Request, authorization checkpoint, Action Receipt, and receipt-backed software operation labels source-owned.',
  },
  {
    label: 'owner route context',
    relativeFile: 'src/routes/owner.business-actions.fixture',
    copy: 'Owner business action route copy can show an Action Receipt only after the authorization checkpoint and support kill-rule proof exist.',
  },
] as const

const phase6PublicOverclaimExamples = [
  {
    rule: 'p6-business-action-overclaim',
    copy: 'Public page: receipt-backed autonomous business operation is live for every business.',
  },
  {
    rule: 'p6-autonomous-money-marketplace-overclaim',
    copy: 'Public page: self-approving agent handles unbounded autonomous spend, instant purchase, agent checkout, AE wallet, AE credits, AE custody, seller payout, marketplace settlement, Stripe Connect, x402, product marketplace, generic API marketplace, and production autonomous payment support.',
  },
] as const

describe('Phase 6 business-action copy guardrail', () => {
  it.each(phase6OwnedCopyExamples)('allows Phase 6 terms in $label', ({ copy, relativeFile }) => {
    expect(scanCopyFixture(relativeFile, copy)).toEqual([])
  })

  it.each(phase6PublicOverclaimExamples)('rejects $rule outside source-owned proof context', ({ copy, rule }) => {
    const violations = scanCopyFixture('public-copy/phase6-overclaim.fixture', copy)

    expect(violations.map((violation) => violation.rule)).toContain(rule)
  })

  it('allows public copy to name Phase 6 capability only as unavailable or deferred', () => {
    const violations = scanCopyFixture(
      'public-copy/phase6-unavailable.fixture',
      'Public page: Business Action Card, Action Receipt, and receipt-backed autonomous business operation remain unavailable until source-owned receipt and support proof exists.',
    )

    expect(violations).toEqual([])
  })

  it('rejects Phase 6 business-action claims in the wrong phase context', () => {
    const violations = scanCopyFixture(
      '.planning/phases/05-paid-activation-money-rails/wrong-phase.fixture',
      'Phase 5 page says Business Action Card and receipt-backed autonomous business operation are ready.',
    )

    expect(violations.map((violation) => violation.rule)).toContain('p6-business-action-overclaim')
  })

  it('rejects generic action and route-local business-action source drift', () => {
    const violations = scanSourceFixture(
      [
        'executeAction actionSlug: string provider: "other"',
        'paymentRequired: true callable: true',
        'const businessActionRows = []',
        'amountCents: client.amountCents currency: client.currency providerId: client.providerId customerId: client.customerId',
      ].join('\n'),
    )

    expect(violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining([
        'business-action-generic-runtime',
        'business-action-positive-authority',
        'business-action-route-local-fixture',
        'business-action-client-authority-field',
      ]),
    )
  })
})

function scanCopyFixture(relativeFile: string, copy: string) {
  const root = mkdtempSync(join(tmpdir(), 'ae-p6-copy-claims-'))
  const fixture = join(root, relativeFile)

  mkdirSync(dirname(fixture), { recursive: true })
  writeFileSync(fixture, `${copy}\n`, 'utf8')

  try {
    return scanCopyClaims([{ root: fixture, includeExtensions: ['.fixture'] }])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

function scanSourceFixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'ae-p6-source-claims-'))
  const fixture = join(root, 'phase6-source-drift.fixture')

  writeFileSync(fixture, `${source}\n`, 'utf8')

  try {
    return scanSourceMining([{ root: fixture, includeExtensions: ['.fixture'] }])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}
