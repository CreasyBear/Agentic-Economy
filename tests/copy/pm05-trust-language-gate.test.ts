import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { scanCopyClaims, scanPublicLanguage, type ScanViolation } from '@/lib/ui/contract-scans'
import { getDefaultPublicOwnerStatusReadback } from '@/modules/catalog/public'
import { buildPublicBusinessSeo, serializeJsonLd } from '@/modules/seo/public'

const publicTrustRiskExamples = [
  { name: 'booking', term: 'Book now', copy: 'Book now with a ready provider.' },
  { name: 'payment', term: 'payment', copy: 'Complete payment with AE today.' },
  { name: 'dispatch', term: 'Dispatch', copy: 'Dispatch a provider from this page.' },
  { name: 'autonomy', term: 'Autonomous', copy: 'Autonomous fulfilment completes the job for you.' },
  { name: 'live availability', term: 'Real-time availability', copy: 'Real-time availability shows who can come now.' },
  { name: 'marketplace liquidity', term: 'Marketplace with ready providers', copy: 'Marketplace with ready providers in every suburb.' },
  { name: 'source-owned', term: 'Source-owned', copy: 'Source-owned status proves the answer.' },
  { name: 'readback', term: 'readback', copy: 'Check the route readback before contacting.' },
  { name: 'manifest', term: 'manifest', copy: 'Download the business manifest.' },
  { name: 'capability', term: 'capability', copy: 'This business has a booking capability.' },
  { name: 'gateway', term: 'gateway', copy: 'The action gateway is open.' },
  { name: 'operator', term: 'operator', copy: 'The operator dashboard controls replies.' },
  { name: 'MCP', term: 'MCP', copy: 'Use MCP to call this business.' },
  { name: 'OpenAPI', term: 'OpenAPI', copy: 'OpenAPI describes every action.' },
  { name: 'callable', term: 'callable', copy: 'This listing is callable by agents.' },
  { name: 'agent-native', term: 'agent-native', copy: 'agent-native supply is ready.' },
  { name: 'DTO', term: 'DTO', copy: 'The public DTO is documented here.' },
  { name: 'fixture', term: 'fixture', copy: 'The demo fixture is visible to visitors.' },
  { name: 'unqualified verified', term: 'Verified', copy: 'Verified provider with verified receipt.' },
] as const

const assistantDescriptorRiskExamples = [
  { name: 'booking descriptor', term: 'booking', summary: 'Creates a booking for the customer.' },
  { name: 'payment descriptor', term: 'payment', summary: 'Takes payment from the customer.' },
  { name: 'dispatch descriptor', term: 'dispatch', summary: 'Dispatch a provider after submission.' },
  { name: 'autonomy descriptor', term: 'autonomous', summary: 'Autonomous fulfilment completes work.' },
  { name: 'live availability descriptor', term: 'available now', summary: 'Returns providers available now.' },
  { name: 'marketplace descriptor', term: 'marketplace liquidity', summary: 'Uses marketplace liquidity for routing.' },
  { name: 'source-owned descriptor', term: 'source-owned', summary: 'Reads the source-owned manifest.' },
  { name: 'readback descriptor', term: 'readback', summary: 'Returns public route readback.' },
  { name: 'manifest descriptor', term: 'manifest', summary: 'Returns the business manifest.' },
  { name: 'capability descriptor', term: 'capability', summary: 'Lists every business capability.' },
  { name: 'gateway descriptor', term: 'gateway', summary: 'Uses an action gateway.' },
  { name: 'operator descriptor', term: 'operator', summary: 'Routes through operator controls.' },
  { name: 'MCP descriptor', term: 'MCP', summary: 'Advertises MCP actions.' },
  { name: 'OpenAPI descriptor', term: 'OpenAPI', summary: 'Advertises an OpenAPI action descriptor.' },
  { name: 'callable descriptor', term: 'callable', summary: 'Marks the listing callable.' },
  { name: 'agent-native descriptor', term: 'agent-native', summary: 'Advertises agent-native supply.' },
  { name: 'DTO descriptor', term: 'DTO', summary: 'Returns the DTO.' },
  { name: 'fixture descriptor', term: 'fixture', summary: 'Exposes the fixture.' },
  { name: 'unqualified verified descriptor', term: 'verified', summary: 'Marks the business verified.' },
] as const

const publicVocabularyContract =
  'Book now, payment, Dispatch, autonomous fulfilment, real-time availability, marketplace with ready providers, source-owned, readback, manifest, capability, gateway, operator, MCP, OpenAPI, callable, agent-native, DTO, fixture, verified provider.'

const sourceLocalScope5PaymentCopy =
  'Scope 5 source/local demo uses Stripe test-mode checkout and paid receipt wording only in a fixture; no live payment, no customer charge, and no production payment proof are claimed.'

const pm05PublicOutputVocabularyPattern =
  /\b(?:book(?:ed|ing)?|schedul(?:e|ed|ing)|dispatch(?:ed|es|ing)?|auto[- ]?fulfil(?:l|led|ment)?|autonomous(?:ly)?|pay(?:ment|ments|ing)?|paid|checkout|charg(?:e|ed|ing)|wallet|settlement|live\s+(?:availability|payment|money|stripe)|real[- ]?time\s+availability|marketplace\s+(?:liquidity|ready|providers?)|source-owned|readback|manifest|capabilit(?:y|ies)|gateway|operator|MCP|OpenAPI|callable|agent-native|DTO|fixture|verified)\b/i

describe('PM-05 trust-language gate', () => {
  it.each(publicTrustRiskExamples)('rejects $name language on public human surfaces', ({ copy, term }) => {
    const violations = scanFixture('ae-pm05-public-', 'src/routes/pm05-public-copy.fixture', `export const copy = '${copy}'`, (fixture) =>
      scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )

    expectViolationForTerm(violations, term)
  })

  it.each(assistantDescriptorRiskExamples)(
    'rejects $name language in assistant-visible descriptor-like fixtures',
    ({ summary, term }) => {
      const descriptor = JSON.stringify({
        id: `pm05.${term.replace(/[^A-Za-z0-9]/g, '')}`,
        name: 'PM-05 descriptor fixture',
        summary,
        boundaries: [`${summary} Boundary text repeats: ${term}.`],
      })

      const violations = scanFixture('ae-pm05-public-', 'src/routes/api.agent.tools.pm05.fixture', descriptor, (fixture) =>
        scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
      )

      expectViolationForTerm(violations, term)
    },
  )

  it('allows planning, copy-test, and internal contexts to document the banned public vocabulary contract', () => {
    expect(scanFixture('ae-pm05-public-', '.planning/scopes/PM-05-copy-contract.fixture', publicVocabularyContract, (fixture) =>
      scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )).toEqual([])
    expect(scanFixture('ae-pm05-public-', 'tests/copy/pm05-copy-contract.fixture', publicVocabularyContract, (fixture) =>
      scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )).toEqual([])
    expect(scanFixture('ae-pm05-public-', 'src/modules/registry/internal/pm05-copy-contract.fixture', publicVocabularyContract, (fixture) =>
      scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )).toEqual([])
  })

  it('allows verified only when paired with a named standard and evidence row wording', () => {
    const copy =
      'Verified against AE Qualified Inquiry Standard v1 with evidence row trust-row-42; no booking, payment, dispatch, or availability is implied.'

    expect(scanFixture('ae-pm05-public-', 'src/routes/pm05-named-standard.fixture', `export const copy = '${copy}'`, (fixture) =>
      scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )).toEqual([])
  })

  it('allows exact safe-contract refusal wording on public human surfaces', () => {
    const copy = 'AE does not book, charge, dispatch, take payment, or show live availability.'

    expect(scanFixture('ae-pm05-public-', 'src/routes/pm05-boundary-refusal.fixture', `export const copy = '${copy}'`, (fixture) =>
      scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )).toEqual([])
  })

  it('rejects boundary wording when a contrast segment adds a positive payment claim', () => {
    const copy = 'AE does not book or dispatch, but payment is live now.'

    const violations = scanFixture('ae-pm05-public-', 'src/routes/pm05-boundary-overclaim.fixture', `export const copy = '${copy}'`, (fixture) =>
      scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )

    expectViolationForTerm(violations, 'payment is live')
  })

  it('allows Scope 5 payment-like wording only in source-local test-mode phase context with a no-live-payment boundary', () => {
    expect(
      scanFixture(
        'ae-pm05-copy-',
        '.planning/archive/phases/05-paid-activation-money-rails/05-04-demo.fixture',
        sourceLocalScope5PaymentCopy,
        (fixture) => scanCopyClaims([{ root: fixture, includeExtensions: ['.fixture'] }]),
      ),
    ).toEqual([])
  })

  it('rejects Scope 5 payment-like wording outside an allowed source-local test-mode phase context', () => {
    const violations = scanFixture(
      'ae-pm05-copy-',
      'public-copy/pm05-scope5-overclaim.fixture',
      'Public page: Stripe checkout is paid and live, payment is complete, and production payment proof exists.',
      (fixture) => scanCopyClaims([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )

    expect(violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining(['p5-paid-activation-overclaim']),
    )
  })

  it('keeps public SEO output free of PM-05 banned public vocabulary', () => {
    const readback = getDefaultPublicOwnerStatusReadback()
    const seo = buildPublicBusinessSeo({
      catalog: readback.catalog,
      options: { canonicalBaseUrl: 'https://ae.example/' },
    })
    const publicSeoOutput = [seo.title, seo.description, seo.h1, serializeJsonLd(seo.jsonLd)].join('\n')
    expect(publicSeoOutput).not.toMatch(pm05PublicOutputVocabularyPattern)
    expect(scanFixture('ae-pm05-public-', 'public-output/pm05-seo.fixture', publicSeoOutput, (fixture) =>
      scanPublicLanguage([{ root: fixture, includeExtensions: ['.fixture'] }]),
    )).toEqual([])
  })
})

function expectViolationForTerm(violations: readonly ScanViolation[], term: string) {
  expect(violations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        excerpt: expect.stringContaining(term),
      }),
    ]),
  )
}


function scanFixture(
  prefix: string,
  relativeFile: string,
  copy: string,
  scan: (fixture: string) => readonly ScanViolation[],
): readonly ScanViolation[] {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const fixture = join(root, relativeFile)

  mkdirSync(dirname(fixture), { recursive: true })
  writeFileSync(fixture, `${copy}\n`, 'utf8')

  try {
    return scan(fixture)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

