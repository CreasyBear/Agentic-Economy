import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { aeCopy } from '@/lib/ui/copy'
import { scanCopyClaims } from '@/lib/ui/contract-scans'
import { getDefaultPublicOwnerStatusReadback } from '@/modules/catalog/public'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'
import { handleBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleListBusinessesRequest } from '@/routes/api.businesses'
import { handleSearchBusinessesRequest } from '@/routes/api.businesses.search'
import { handleLlmsTxtRequest } from '@/routes/llms[.]txt'
import { handleUcpManifestRequest } from '@/routes/$slug.ucp'

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
  {
    phase: 'P6 business action receipt',
    relativeFile: '.planning/phases/06-agentic-business-action-receipts/06-UI-SPEC.fixture',
    copy: 'Phase 6 Business Action Card and Capability Request show the authorization checkpoint, GuardrailDecisionEvidence, ExternalEvidenceEvent, Action Receipt, receipt-backed software operation, receipt-backed autonomous business operation, and Hermes-run paid intake provisioning as source/local proof only; self-approving agent, agent checkout, AE wallet, Connect/x402, product marketplace, generic API marketplace, and production autonomous payment support remain unavailable.',
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
  {
    rule: 'p6-business-action-overclaim',
    copy: 'Public page: receipt-backed autonomous business operation is live for every business.',
  },
  {
    rule: 'p6-autonomous-money-marketplace-overclaim',
    copy: 'Public page: self-approving agent, unbounded autonomous spend, instant purchase, agent checkout, AE wallet, AE credits, AE custody, seller payout, marketplace settlement, Stripe Connect, x402, product marketplace, generic API marketplace, and production autonomous payment support are ready.',
  },
  {
    rule: 'payment-or-booking-overclaim',
    copy: 'Public page: bookings are available and payments are live.',
  },
  {
    rule: 'p3-developer-platform-overclaim',
    copy: 'Public page: /.well-known/ucp and OpenAPI are available.',
  },
  {
    rule: 'p5-money-rail-overclaim',
    copy: 'Public page: balance is live and Connect is ready.',
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
  {
    rule: 'p6-business-action-overclaim',
    relativeFile: '.planning/phases/05-paid-activation-money-rails/wrong-phase.fixture',
    copy: 'Business Action Card and receipt-backed autonomous business operation are ready for paid activation.',
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

  it('allows explicit public unavailable/deferred future-capability exclusions', () => {
    const violations = scanFixture(
      'public-copy/gated-exclusions.fixture',
      'Public page: Stripe Checkout and subscription remain unavailable; SDK/CLI platform, MCP tools, OpenAPI action endpoint, callable endpoint, API-key platform, protected action proposal, wallet credits, Connect/x402, marketplace payout, and payment handler are deferred or out of scope.',
    )

    expect(violations).toEqual([])
  })

  it('rejects mixed negative and positive future-capability copy', () => {
    const moneyViolations = scanFixture(
      'public-copy/overclaim.fixture',
      'Public page: wallet is unavailable, but credits are live.',
    )
    const protocolViolations = scanFixture(
      'public-copy/overclaim.fixture',
      'Public page: MCP tools remain unavailable, but callable endpoint is live.',
    )

    expect(moneyViolations.map((violation) => violation.rule)).toContain('p5-money-rail-overclaim')
    expect(protocolViolations.map((violation) => violation.rule)).toContain('p3-developer-platform-overclaim')
  })

  it('covers committed route, API, discovery, and SEO source surfaces', () => {
    const surfaceTargets = [
      { root: 'src/routes', includeExtensions: ['.ts', '.tsx'] },
      { root: 'src/components/ae', includeExtensions: ['.ts', '.tsx'] },
      { root: 'src/lib/ui/copy.ts', includeExtensions: ['.ts'] },
      { root: 'src/modules/catalog', includeExtensions: ['.ts'] },
      { root: 'src/modules/registry', includeExtensions: ['.ts'] },
      { root: 'src/modules/discovery', includeExtensions: ['.ts'] },
      { root: 'src/modules/seo', includeExtensions: ['.ts'] },
    ] as const

    expect(scanCopyClaims(surfaceTargets)).toEqual([])
  })

  it('traces route/API/discovery/SEO claims to source-owned output state', async () => {
    const readback = getDefaultPublicOwnerStatusReadback()
    const seo = buildPublicBusinessSeo({
      catalog: readback.catalog,
      options: { canonicalBaseUrl: 'https://ae.example' },
    })
    const list = await handleListBusinessesRequest(new Request('https://ae.example/api/businesses')).json()
    const search = await handleSearchBusinessesRequest(
      new Request('https://ae.example/api/businesses/search?q=emergency+plumber+parramatta')
    ).json()
    const detail = await handleBusinessDetailRequest('parramatta-emergency-plumbing').json()
    const ucp = await handleUcpManifestRequest(
      new Request('https://ae.example/parramatta-emergency-plumbing/ucp'),
      'parramatta-emergency-plumbing'
    ).json()
    const llms = await handleLlmsTxtRequest(new Request('https://ae.example/llms.txt')).text()

    expect(readback).toMatchObject({
      publicUrl: '/parramatta-emergency-plumbing',
      noindex: true,
      catalog: {
        publicStatus: 'published',
        indexStatus: 'queued',
        discoveryStatus: 'degraded',
        trustTier: 'claimed',
      },
    })
    expect(list).toMatchObject({ kind: 'ok', schemaVersion: 'public-business-catalog-api:v1' })
    expect(search).toMatchObject({ kind: 'ok', pagination: { total: 1, hasMore: false } })
    expect(detail).toMatchObject({ kind: 'found', schemaVersion: 'public-business-catalog-api:v1' })
    expect(ucp).toMatchObject({
      pathKind: 'ae_hosted_fallback',
      status: 'available',
      unsupportedCapabilities: { callable: false, paymentRequired: false },
    })
    expect(seo).toMatchObject({
      slug: 'parramatta-emergency-plumbing',
      canonicalUrl: 'https://ae.example/parramatta-emergency-plumbing',
      indexDirective: 'index',
    })

    const serializedPublicOutputs = [
      seo.title,
      seo.description,
      serializeJsonLd(seo.jsonLd),
      JSON.stringify(list),
      JSON.stringify(search),
      JSON.stringify(detail),
      JSON.stringify(ucp),
      llms,
    ].join('\n')

    expect(scanFixture('public-output/claims.fixture', serializedPublicOutputs)).toEqual([])
  })

  it('keeps GTM readiness gated on activation evidence instead of launch-ready copy', () => {
    const gtm = readFileSync('.planning/GTM-READINESS.md', 'utf8')

    expect(gtm).toContain('Phase 1 cannot be called launch-ready until')
    expect(gtm).toContain('owner activation state exists')
    expect(gtm).toContain('claims register exists and copy scan covers marketing assets')
    expect(gtm).toContain('claimId')
    expect(gtm).toContain('exactPublicCopy')
    expect(gtm).toContain('requiredReadback')
    expect(gtm).toContain('requiredFunnelEvent')
    expect(gtm).toContain('evidenceStatus')
    expect(gtm).not.toMatch(/Phase 1 is launch-ready/i)
  })

  it('treats optional product-marketing context as non-public draft until evidence exists', () => {
    if (!existsSync('.agents/product-marketing.md')) {
      return
    }

    const productMarketing = readFileSync('.agents/product-marketing.md', 'utf8')

    expect(productMarketing).toContain('Phase 1 has no paid path')
    expect(productMarketing).toContain('Do not invent')
    expect(productMarketing).toContain('Future')
    expect(productMarketing).not.toMatch(/launch-ready/i)
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
