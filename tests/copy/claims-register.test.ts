import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { aeCopy } from '@/lib/ui/copy'
import { scanCopyClaims } from '@/lib/ui/contract-scans'

const phaseOwnedCopyExamples = [
  {
    phase: 'P2 inquiry/inbox',
    relativeFile: '.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.fixture',
    copy: 'Phase 2 customer inquiry and owner inbox copy names Resend/Novu notification outbox delivery readback; booking, payment, and protected action remain unavailable.',
  },
  {
    phase: 'P3 read-only discovery',
    relativeFile: '.planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.fixture',
    copy: 'Phase 3 read-only discovery exposes developer discovery, schema docs, API examples, support matrix, and route health; SDK/CLI platform, MCP mutation, API-key platform, standard merchant-origin UCP, OpenAPI action descriptor, callable endpoint, and payment handler remain unavailable.',
  },
  {
    phase: 'P4 protected action',
    relativeFile: '.planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.fixture',
    copy: 'Phase 4 protected-action loop presents a protected action proposal for owner approval before a provider/internal attempt; autonomous protected execution and direct execute remain unavailable.',
  },
  {
    phase: 'P5 paid activation',
    relativeFile: '.planning/phases/05-paid-activation-money-rails/05-UI-SPEC.fixture',
    copy: 'Phase 5 Autumn+Stripe paid activation shows Stripe PSP checkout, subscription, customer portal, and billing reconciliation; wallet/credits, balance, stored value, Connect/x402, x402 checkout, custody rail, direct Stripe subscription authority, marketplace payout, split payout, and settlement platform remain unavailable.',
  },
] as const

const publicOverclaimExamples = [
  {
    rule: 'p2-inquiry-overclaim',
    copy: 'Public page: customer inquiry and owner inbox are live today.',
  },
  {
    rule: 'p2-notification-provider-overclaim',
    copy: 'Public page: Resend/Novu email notification delivery readback is live.',
  },
  {
    rule: 'p3-read-only-discovery-overclaim',
    copy: 'Public page: developer discovery API docs and route health are live.',
  },
  {
    rule: 'p3-developer-platform-overclaim',
    copy: 'Public page: SDK/CLI platform with MCP mutation, API-key platform, standard merchant-origin UCP, OpenAPI action descriptor, callable endpoint, and payment handler is live.',
  },
  {
    rule: 'p4-protected-action-overclaim',
    copy: 'Public page: protected action proposal with owner approval and provider/internal attempt is live.',
  },
  {
    rule: 'p4-autonomous-action-overclaim',
    copy: 'Public page: autonomous protected execution can direct execute with provider success.',
  },
  {
    rule: 'p5-paid-activation-overclaim',
    copy: 'Public page: Autumn+Stripe paid activation checkout and subscription are live.',
  },
  {
    rule: 'p5-money-rail-overclaim',
    copy: 'Public page: wallet/credits, balance, stored value, Connect/x402, x402 checkout, custody rail, direct Stripe subscription authority, marketplace payout, split payout, and settlement platform are ready.',
  },
] as const

const wrongPhaseExamples = [
  {
    rule: 'p2-inquiry-overclaim',
    relativeFile: '.planning/phases/03-standard-agent-builder-discovery/wrong-phase.fixture',
    copy: 'Customer inquiry and owner inbox are ready for builders.',
  },
  {
    rule: 'p3-read-only-discovery-overclaim',
    relativeFile: '.planning/phases/05-paid-activation-money-rails/wrong-phase.fixture',
    copy: 'Developer discovery API docs and route health are ready for paid activation.',
  },
  {
    rule: 'p4-protected-action-overclaim',
    relativeFile: '.planning/phases/02-human-inquiry-owner-inbox/wrong-phase.fixture',
    copy: 'Protected action proposal with owner approval is ready for the inbox.',
  },
  {
    rule: 'p5-paid-activation-overclaim',
    relativeFile: '.planning/phases/04-owner-pending-protected-actions/wrong-phase.fixture',
    copy: 'Autumn+Stripe paid activation checkout is ready for protected actions.',
  },
] as const

describe('claims register seed copy', () => {
  it('keeps the foundation shell explicitly non-mutating', () => {
    expect(aeCopy.shellDescription).toContain('non-mutating shell')
    expect(aeCopy.notLiveNotice).toContain('not live')
  })

  it.each(phaseOwnedCopyExamples)('allows $phase claims in phase-owned planning/test context', ({ copy, relativeFile }) => {
    expect(scanFixture(relativeFile, copy)).toEqual([])
  })

  it.each(publicOverclaimExamples)('rejects $rule outside phase-owned context', ({ copy, rule }) => {
    const violations = scanFixture('public-copy/overclaim.fixture', copy)

    expect(violations.map((violation) => violation.rule)).toContain(rule)
  })

  it.each(wrongPhaseExamples)('rejects $rule in the wrong phase context', ({ copy, relativeFile, rule }) => {
    const violations = scanFixture(relativeFile, copy)

    expect(violations.map((violation) => violation.rule)).toContain(rule)
  })

  it('rejects future-platform claims hidden behind unless wording', () => {
    const violations = scanFixture(
      'public-copy/overclaim.fixture',
      'Public page: wallet credits, MCP tools, and direct Stripe subscription authority are available unless the owner disables them.',
    )

    expect(violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining(['p3-developer-platform-overclaim', 'p5-money-rail-overclaim']),
    )
  })
})

function scanFixture(relativeFile: string, copy: string) {
  const root = mkdtempSync(join(tmpdir(), 'ae-copy-claims-'))
  const fixture = join(root, relativeFile)

  mkdirSync(dirname(fixture), { recursive: true })
  writeFileSync(fixture, `${copy}\n`, 'utf8')

  try {
    return scanCopyClaims([{ root: fixture, includeExtensions: ['.fixture'] }])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

