import type { SandboxToolSpec } from './sandboxFixture'
import { SANDBOX_TOOL_OFFERING_PRICE, SANDBOX_TOOL_PRICE_AMOUNT, SANDBOX_TOOL_PRICING_SUMMARY } from './pricing'

export const SANDBOX_TOOL_BUSINESS_SLUG = 'sandbox-aecon-reference'
export const SANDBOX_TOOL_LABEL = 'AEcon sandbox FX reference Tool'
export const SANDBOX_TOOL_CAPABILITY_ID = 'sandbox.frankfurter-fx'
// The sandbox commercial-policy fixture every sandbox money gate resolves to
// (src/modules/money/internal/commercial-policy.ts). Declared on the seeded
// Tool so the fixture the Quote path admits is visible in the seed itself.
export const SANDBOX_TOOL_COMMERCIAL_FIXTURE = 'managed_x402_deterministic_v1'

/*
 * The local owner sandbox uses Frankfurter's real public, keyless HTTPS
 * endpoint. It passes the same production transport and access-path admission
 * like every other Tool; no localhost or validator exception exists.
 */
export const SANDBOX_TOOL_ENDPOINT_URL = 'https://api.frankfurter.dev/v1/latest'

export function sandboxReferenceEndpointUrl(): string {
  return SANDBOX_TOOL_ENDPOINT_URL
}

export function sandboxReferenceToolSpec(endpointUrl: string): SandboxToolSpec {
  return {
    businessSlug: SANDBOX_TOOL_BUSINESS_SLUG,
    businessName: 'AEcon sandbox FX reference provider',
    label: SANDBOX_TOOL_LABEL,
    capabilityId: SANDBOX_TOOL_CAPABILITY_ID,
    summary: 'Current exchange rate for a currency pair from Frankfurter.',
    contractDescription: 'Return the current Frankfurter exchange rate for a base and quote currency.',
    requestField: 'from',
    resultField: 'rates',
    additionalRequestFields: ['to'],
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Base currency', pattern: '^[A-Z]{3}$' },
        to: { type: 'string', description: 'Quote currency', pattern: '^[A-Z]{3}$' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        amount: { type: 'number' },
        base: { type: 'string' },
        date: { type: 'string' },
        rates: { type: 'object', additionalProperties: { type: 'number' } },
      },
      required: ['amount', 'base', 'date', 'rates'],
      additionalProperties: false,
    },
    recovery: 'retry_safe',
    endpointUrl,
    method: 'GET',
    pricingSummary: SANDBOX_TOOL_PRICING_SUMMARY,
    pricingConfig: {
      version: 'pricing:v3',
      kind: 'fixed_aud',
      currency: 'AUD',
      exponent: 6,
      amountUnits: SANDBOX_TOOL_PRICE_AMOUNT.units,
    },
    offeringPrice: SANDBOX_TOOL_OFFERING_PRICE,
    materialTerms: [{
      termId: 'sandbox-fixture',
      label: 'Sandbox commercial fixture',
      value: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
    }],
    commercialFixture: SANDBOX_TOOL_COMMERCIAL_FIXTURE,
    ownerMessage: 'Sandbox-only FX reference provider seeded for local catalogue bring-up.',
    sourceLabel: `Frankfurter public keyless FX endpoint ${endpointUrl}`,
    serviceAreaSummary: 'Public internet',
    availabilitySummary: 'Availability is checked from the public Frankfurter endpoint',
    authenticationSummary: 'Public keyless HTTPS endpoint.',
    accessPathSummary: 'Current Frankfurter exchange rate for a base and quote currency.',
    searchTerms: ['sandbox', 'foreign exchange', 'currency rate', 'frankfurter'],
    inputExamples: [{ label: 'EUR to USD', input: { from: 'EUR', to: 'USD' } }],
    source: {
      kind: 'ae_envelope',
      transport: {
        authority: { kind: 'public_upstream' },
        adapter: {
          adapterId: 'http-json:v1',
          config: {
            method: 'GET',
            query: [
              { inputPointer: '/from', parameter: 'from' },
              { inputPointer: '/to', parameter: 'to' },
            ],
            requestTimeoutMs: 5_000,
            credential: { kind: 'none' },
          },
        },
      },
    },
  }
}
