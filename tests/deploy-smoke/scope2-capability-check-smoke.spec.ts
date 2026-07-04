import { expect, test } from '@playwright/test'

type Scope2CapabilityCheckSmokeConfig = {
  baseUrl: URL
  businessSlug: string
  attemptRef: string
  readbackText: string
  facetText: string
  trustState: 'business_supplied' | 'checked' | 'stale' | 'contradicted' | 'unsupported'
  legitimateEvidenceText?: string
}

let config: Scope2CapabilityCheckSmokeConfig | undefined

const decorativeProofPattern = /\b(?:screenshots?|dashboards?|env(?:ironment)? vars?|webhook arrival|webhook arrived|external URLs?)\b/i
const publicCapabilityOverclaimPattern =
  /\b(?:verified|callable|agent-callable|paymentRequired|book(?:ed|ing)?|dispatch(?:ed|es|ing)?|pay(?:ment|ments|ing)?|paid|checkout|charg(?:e|ed|ing)|autonomous(?:ly)?|auto[- ]?fulfil(?:l|led|ment)?|auto[- ]?fulfill(?:ed|ment)?)\b/i

const validTrustStates: Record<Scope2CapabilityCheckSmokeConfig['trustState'], true> = {
  business_supplied: true,
  checked: true,
  stale: true,
  contradicted: true,
  unsupported: true,
}

test.describe('Scope 2 capability-check deployed provider smoke', () => {
  test.beforeAll(() => {
    config = readScope2CapabilityCheckSmokeConfig()
  })

  test('public business page shows source-owned capability check readback without decorative proof or unsafe claims', async ({ page }) => {
    const smokeConfig = requireScope2CapabilityCheckSmokeConfig()

    await page.goto(resolvePath(`/${smokeConfig.businessSlug}`, smokeConfig.baseUrl))
    const bodyText = await page.locator('body').innerText({ timeout: 20_000 })

    expect(bodyText).toContain(smokeConfig.attemptRef)
    expect(bodyText).toContain(smokeConfig.readbackText)
    expect(bodyText).toContain(smokeConfig.facetText)
    expect(bodyText).toContain(smokeConfig.trustState)
    expect(bodyText).not.toMatch(decorativeProofPattern)

    if (smokeConfig.legitimateEvidenceText !== undefined) {
      expect(bodyText).toContain(smokeConfig.legitimateEvidenceText)
      expect(bodyText.replaceAll(smokeConfig.legitimateEvidenceText, '')).not.toMatch(publicCapabilityOverclaimPattern)
    } else {
      expect(bodyText).not.toMatch(publicCapabilityOverclaimPattern)
    }
  })
})

function readScope2CapabilityCheckSmokeConfig(): Scope2CapabilityCheckSmokeConfig {
  const required = {
    DEPLOY_BASE_URL: process.env.DEPLOY_BASE_URL,
    SMOKE_SCOPE2_BUSINESS_SLUG: process.env.SMOKE_SCOPE2_BUSINESS_SLUG,
    SMOKE_SCOPE2_CAPABILITY_ATTEMPT_REF: process.env.SMOKE_SCOPE2_CAPABILITY_ATTEMPT_REF,
    SMOKE_SCOPE2_CAPABILITY_READBACK_TEXT: process.env.SMOKE_SCOPE2_CAPABILITY_READBACK_TEXT,
    SMOKE_SCOPE2_CAPABILITY_FACET_TEXT: process.env.SMOKE_SCOPE2_CAPABILITY_FACET_TEXT,
    SMOKE_SCOPE2_CAPABILITY_TRUST_STATE: process.env.SMOKE_SCOPE2_CAPABILITY_TRUST_STATE,
  }

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.trim().length === 0)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required Scope 2 capability-check smoke env: ${missing.join(', ')}.`,
        'Set DEPLOY_BASE_URL, SMOKE_SCOPE2_BUSINESS_SLUG, SMOKE_SCOPE2_CAPABILITY_ATTEMPT_REF, SMOKE_SCOPE2_CAPABILITY_READBACK_TEXT, SMOKE_SCOPE2_CAPABILITY_FACET_TEXT, and SMOKE_SCOPE2_CAPABILITY_TRUST_STATE.',
        'The deployed source state must include a seeded public business slug, a source-owned capabilityCheckAttempts row ref, facet/readback text values, and the resulting businessCapabilities trust state.',
        'This smoke must not be replaced by screenshots, dashboards, env-var presence, webhook arrival alone, external URLs, or local-only source assertions.',
      ].join(' ')
    )
  }

  const businessSlug = (required.SMOKE_SCOPE2_BUSINESS_SLUG as string).trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessSlug)) {
    throw new Error('SMOKE_SCOPE2_BUSINESS_SLUG must be a lowercase public route slug, such as parramatta-emergency-plumbing.')
  }

  const trustState = (required.SMOKE_SCOPE2_CAPABILITY_TRUST_STATE as string).trim()
  if (validTrustStates[trustState as Scope2CapabilityCheckSmokeConfig['trustState']] !== true) {
    throw new Error(
      'SMOKE_SCOPE2_CAPABILITY_TRUST_STATE must be one of business_supplied, checked, stale, contradicted, or unsupported.'
    )
  }

  const legitimateEvidenceText = process.env.SMOKE_SCOPE2_LEGITIMATE_EVIDENCE_TEXT?.trim()

  return {
    baseUrl: parseHttpsUrl('DEPLOY_BASE_URL', required.DEPLOY_BASE_URL as string),
    businessSlug,
    attemptRef: assertSourceEvidenceRef(
      'SMOKE_SCOPE2_CAPABILITY_ATTEMPT_REF',
      required.SMOKE_SCOPE2_CAPABILITY_ATTEMPT_REF as string
    ),
    readbackText: assertSourceEvidenceRef(
      'SMOKE_SCOPE2_CAPABILITY_READBACK_TEXT',
      required.SMOKE_SCOPE2_CAPABILITY_READBACK_TEXT as string
    ),
    facetText: assertSourceEvidenceRef(
      'SMOKE_SCOPE2_CAPABILITY_FACET_TEXT',
      required.SMOKE_SCOPE2_CAPABILITY_FACET_TEXT as string
    ),
    trustState: trustState as Scope2CapabilityCheckSmokeConfig['trustState'],
    ...(legitimateEvidenceText === undefined || legitimateEvidenceText.length === 0
      ? {}
      : { legitimateEvidenceText: assertSourceEvidenceRef('SMOKE_SCOPE2_LEGITIMATE_EVIDENCE_TEXT', legitimateEvidenceText) }),
  }
}

function parseHttpsUrl(name: string, rawValue: string): URL {
  let parsed: URL

  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https:// for deployed capability-check smoke.`)
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
    throw new Error(`${name} must point at a deployed environment, not localhost.`)
  }

  return parsed
}

function assertSourceEvidenceRef(name: string, rawValue: string): string {
  const value = rawValue.trim()
  if (decorativeProofPattern.test(value) || /^https?:\/\//i.test(value)) {
    throw new Error(
      `${name} must be a source-owned capability check evidence/readback value, not a screenshot, dashboard, env var, webhook arrival, or external URL.`
    )
  }

  return value
}

function requireScope2CapabilityCheckSmokeConfig(): Scope2CapabilityCheckSmokeConfig {
  if (config === undefined) {
    throw new Error('Scope 2 capability-check smoke config was not loaded.')
  }

  return config
}

function resolvePath(path: string, baseUrl: URL): string {
  return new URL(path, baseUrl).toString()
}
