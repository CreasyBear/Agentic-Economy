import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanCopyClaims } from '@/lib/ui/contract-scans'

const businessActionRouteFiles = [
  'src/routes/owner.business-actions.tsx',
  'src/routes/owner.business-actions.$requestId.tsx',
  'src/routes/owner.business-actions.$requestId.receipt.tsx',
  'src/routes/admin.business-actions.tsx',
  'src/routes/admin.business-actions.$requestId.tsx',
] as const

describe('Phase 6 business-action SEO claim safety', () => {
  it('keeps owner/admin business-action routes noindexed and non-commerce', () => {
    for (const file of businessActionRouteFiles) {
      const source = readFileSync(file, 'utf8')

      expect(source, `${file} must declare noindex robots metadata`).toContain("name: 'robots'")
      expect(source, `${file} must declare noindex robots metadata`).toContain("content: 'noindex'")
      expect(source).not.toMatch(/\b(?:canonicalUrl|AggregateRating|Offer|priceRange|paymentAccepted)\b/)
    }
  })

  it('allows demo SEO copy only with source-owned evidence, support, kill-rule, and scan context', () => {
    const copy = [
      'Phase 6 demo copy may say receipt-backed autonomous business operation only in source-owned scan context.',
      'Required evidence: Business Action Card, Capability Request, authorization checkpoint, GuardrailDecisionEvidence, ExternalEvidenceEvent, Action Receipt, source-owned support/kill-rule proof, and local scan coverage.',
      'source/local proof only; production proof not claimed.',
    ].join(' ')

    expect(scanCopyFixture('.planning/phases/06-agentic-business-action-receipts/seo.fixture', copy)).toEqual([])
  })

  it('rejects production autonomous payment SEO phrasing outside Phase 6 proof context', () => {
    const violations = scanCopyFixture(
      'public/seo-business-action-overclaim.fixture',
      'Public SEO: receipt-backed autonomous business operation is live with production autonomous payment support, agent checkout, instant purchase, AE wallet, and marketplace settlement.',
    )

    expect(violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining(['p6-business-action-overclaim', 'p6-autonomous-money-marketplace-overclaim']),
    )
  })
})

function scanCopyFixture(relativeFile: string, copy: string) {
  const root = mkdtempSync(join(tmpdir(), 'ae-p6-seo-claims-'))
  const fixture = join(root, relativeFile)

  mkdirSync(dirname(fixture), { recursive: true })
  writeFileSync(fixture, `${copy}\n`, 'utf8')

  try {
    return scanCopyClaims([{ root: fixture, includeExtensions: ['.fixture'] }])
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}
