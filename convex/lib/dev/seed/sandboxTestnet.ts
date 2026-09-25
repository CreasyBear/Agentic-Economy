import type { JsonValue } from '@/modules/capability-contract/public'
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS, validateX402PaymentRequired } from '@/modules/capability-supply/convex'
import type { OfferingPrice } from '@/modules/catalog/public'
import type { SandboxToolSpec } from './sandboxFixture'

/*
 * The Base Sepolia x402 reference provider.
 *
 * Every fact below except the endpoint host and the payee is the provider's
 * own published constant (tools/release/package5-reference-provider/core.ts):
 * `exact` scheme on Base Sepolia, USDC, 1000 atomic units, 60s timeout,
 * `POST /x402/execute`. The host and payee are deployment facts, so they are
 * read from the same two environment names the provider deployment itself
 * requires — never hard-coded here.
 */
export const SANDBOX_TESTNET_BUSINESS_SLUG = 'sandbox-aecon-testnet'
export const SANDBOX_TESTNET_LABEL = 'AEcon sandbox testnet reference Tool'
export const SANDBOX_TESTNET_CAPABILITY_ID = 'sandbox.aecon-testnet-reference'
export const SANDBOX_TESTNET_COMMERCIAL_FIXTURE = 'package5_reference_provider_x402_base_sepolia'
export const SANDBOX_TESTNET_ROUTE_PATH = '/x402/execute'
export const SANDBOX_TESTNET_ATOMIC_AMOUNT = '1000'
export const SANDBOX_TESTNET_USDC_EXPONENT = 6
export const SANDBOX_TESTNET_MAX_TIMEOUT_SECONDS = 60
export const SANDBOX_TESTNET_CONNECTION_REF = `connection:x402:${SANDBOX_TESTNET_BUSINESS_SLUG}`
export const SANDBOX_TESTNET_PROVIDER_REF = `provider:x402:${SANDBOX_TESTNET_BUSINESS_SLUG}`
export const SANDBOX_TESTNET_PRICING_SUMMARY = 'USDC 0.001 per Call (Base Sepolia testnet)'
export const SANDBOX_TESTNET_PRICE_AMOUNT = {
  currency: 'USDC',
  units: SANDBOX_TESTNET_ATOMIC_AMOUNT,
  exponent: SANDBOX_TESTNET_USDC_EXPONENT,
} as const
export const SANDBOX_TESTNET_OFFERING_PRICE: OfferingPrice = {
  kind: 'fixed',
  amount: { ...SANDBOX_TESTNET_PRICE_AMOUNT },
  unit: 'call',
  taxTreatment: 'unstated',
}

/*
 * The reference provider's own environment names
 * (tools/release/package5-reference-provider/api/fixture.ts). A deployment that
 * runs the paid leg has to know the same two facts the provider deployment
 * knows, so the seed reads them under the provider's names rather than minting
 * a second name for the same value.
 *
 * They are not declared in `convex/convex.config.ts`, so the typed `env` object
 * is widened for the read. Convex populates every deployment environment
 * variable regardless of declaration; declaring them there (and in
 * `.env.example`) is the follow-up that makes them typed.
 */
export const SANDBOX_TESTNET_ORIGIN_ENV = 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN'
export const SANDBOX_TESTNET_PAY_TO_ENV = 'AE_PACKAGE5_FIXTURE_X402_PAY_TO'

export const SANDBOX_TESTNET_SKIP_ORIGIN_MISSING = 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN_missing'
export const SANDBOX_TESTNET_SKIP_PAY_TO_MISSING = 'AE_PACKAGE5_FIXTURE_X402_PAY_TO_missing'

export function sandboxTestnetPaymentRequired(
  endpointUrl: string,
  payTo: string,
): Readonly<Record<string, JsonValue>> {
  return validateX402PaymentRequired({
    x402Version: 2,
    resource: { url: endpointUrl },
    accepts: [{
      scheme: 'exact',
      network: BASE_SEPOLIA_NETWORK,
      amount: SANDBOX_TESTNET_ATOMIC_AMOUNT,
      asset: BASE_SEPOLIA_USDC_ADDRESS,
      payTo,
      maxTimeoutSeconds: SANDBOX_TESTNET_MAX_TIMEOUT_SECONDS,
      extra: { name: 'USDC', version: '2' },
    }],
  }) as Readonly<Record<string, JsonValue>>
}

export function sandboxTestnetToolSpec(endpointUrl: string, payTo: string): SandboxToolSpec {
  return {
    businessSlug: SANDBOX_TESTNET_BUSINESS_SLUG,
    businessName: 'AEcon sandbox testnet reference provider',
    label: SANDBOX_TESTNET_LABEL,
    capabilityId: SANDBOX_TESTNET_CAPABILITY_ID,
    summary: 'Base Sepolia x402 reference Tool that returns one deterministic structured result.',
    contractDescription: 'Return the reference provider’s deterministic result for a structured value.',
    requestField: 'value',
    resultField: 'value',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { value: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['value'],
      additionalProperties: false,
    },
    // Keep readiness inspection on the provider's declared validation input.
    inputExamples: [{ label: 'Validation input', input: { value: 'x402-validation' } }],
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        sourceKind: { type: 'string' },
        value: { type: 'string' },
        provider: { type: 'string' },
      },
      required: ['sourceKind', 'value', 'provider'],
      additionalProperties: false,
    },
    // A settled x402 payment is not replayable: recovery reconciles, never retries.
    recovery: 'reconcile_required',
    endpointUrl,
    method: 'POST',
    pricingSummary: SANDBOX_TESTNET_PRICING_SUMMARY,
    // Managed x402: the buyer total is settled by a binding Quote in AUD, so
    // the publication displays `on_request` (derived from this pricing
    // config) and the provider's own atomic charge is carried below.
    pricingConfig: {
      version: 'pricing:v3',
      kind: 'managed_x402',
      effectTiming: 'payment_required_before_effect',
      sourceRequirement: {
        network: BASE_SEPOLIA_NETWORK,
        asset: BASE_SEPOLIA_USDC_ADDRESS,
        atomicUnits: SANDBOX_TESTNET_ATOMIC_AMOUNT,
      },
      pricingPolicyRef: 'pricing-policy:managed-x402-reference:v1',
      publicDisplay: 'on_request',
    },
    offeringPrice: SANDBOX_TESTNET_OFFERING_PRICE,
    materialTerms: [
      {
        termId: 'sandbox-fixture',
        label: 'Sandbox commercial fixture',
        value: SANDBOX_TESTNET_COMMERCIAL_FIXTURE,
      },
      {
        termId: 'provider-amount',
        label: 'Listed Provider amount',
        value: `${SANDBOX_TESTNET_ATOMIC_AMOUNT} atomic USDC on ${BASE_SEPOLIA_NETWORK}`,
      },
      {
        termId: 'buyer-total',
        label: 'Buyer total',
        value: 'Confirmed in AUD by a binding Quote for your input.',
      },
    ],
    commercialFixture: SANDBOX_TESTNET_COMMERCIAL_FIXTURE,
    ownerMessage: 'Base Sepolia x402 reference provider seeded for the real paid-Call proof.',
    sourceLabel: `Package 5 reference provider ${SANDBOX_TESTNET_COMMERCIAL_FIXTURE} ${endpointUrl}`,
    serviceAreaSummary: 'Base Sepolia testnet only',
    availabilitySummary: 'Always available while the reference provider deployment is up',
    authenticationSummary: 'x402 exact scheme on Base Sepolia USDC; no provider credential.',
    accessPathSummary: 'Base Sepolia x402 access path for the reference provider Tool.',
    searchTerms: ['sandbox', 'testnet', 'x402', 'base sepolia', 'usdc'],
    source: {
      kind: 'x402',
      payTo,
      connectionRef: SANDBOX_TESTNET_CONNECTION_REF,
      providerRef: SANDBOX_TESTNET_PROVIDER_REF,
      requestTimeoutMs: 30_000,
      paymentRequired: sandboxTestnetPaymentRequired(endpointUrl, payTo),
      providerPrice: { ...SANDBOX_TESTNET_PRICE_AMOUNT },
    },
  }
}
