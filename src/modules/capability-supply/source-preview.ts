import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'

import {
  validHttpsUrl,
  type CapabilityPublicationImportRefusal,
} from './internal/publication-importer-types'
import {
  BASE_MAINNET_NETWORK,
  BASE_SEPOLIA_NETWORK,
} from './internal/x402-payment-profile'
import {
  inspectX402SellerEndpoint,
  type X402SellerEndpointInspection,
} from './internal/x402-seller-endpoint-inspector'

export type SupplySourceInput = Readonly<{
  kind: 'x402'
  resourceUrl: string
  method?: 'GET' | 'POST'
  environment?: 'sandbox' | 'production'
}>

export type SourceAuthenticationRequirement =
  | Readonly<{ kind: 'public' }>
  | Readonly<{ kind: 'api_key'; location: 'header' | 'query'; name: string }>
  | Readonly<{ kind: 'http_bearer' }>
  | Readonly<{ kind: 'mcp_oauth' }>
  | Readonly<{ kind: 'x402_wallet' }>
  | Readonly<{ kind: 'unsupported' }>

export type SupplyToolCandidate = Readonly<{
  candidateRef: string
  sourceSelector: Readonly<{ resourceUrl: string; method: 'GET' | 'POST' }>
  title: string
  description: string
  inputSchema?: Readonly<Record<string, JsonValue>> | undefined
  outputSchema?: Readonly<Record<string, JsonValue>> | undefined
  authentication: SourceAuthenticationRequirement
  validationExampleAvailable: boolean
  x402?: Readonly<{
    scheme: string
    network: string
    amount: string
    asset: string
    payTo: string
    environment: 'sandbox' | 'production'
  }> | undefined
  disposition:
    | Readonly<{ kind: 'supported' }>
    | Readonly<{ kind: 'unsupported'; reason: CapabilityPublicationImportRefusal }>
}>

export type SupplySourcePreview =
  | Readonly<{
      kind: 'ready'
      sourceDigest: string
      sourceRevision: string
      provenance: Readonly<{
        sourceKind: 'x402'
        sourceUrl: string
        authority: 'observed_external'
      }>
      authentication: readonly SourceAuthenticationRequirement[]
      candidates: readonly SupplyToolCandidate[]
    }>
  | Readonly<{
      kind: 'action_required'
      ownerHandoff: Readonly<{
        actor: 'business_owner'
        reason: 'source_attention_required' | 'payee_proof_required' | 'business_unavailable' | 'provider_connections_unavailable'
        destination: string
        ctaLabel: string
        description: string
        title: string
      }>
    }>

export type SupplySourcePreviewDependencies = Readonly<{
  inspectX402?: (input: Readonly<{
    endpointUrl: string
    method: 'GET' | 'POST'
    deriveAeEnvironment: true
  }>) => Promise<X402SellerEndpointInspection>
}>

const supplySourceTransportSchema = z.strictObject({
  kind: z.literal('x402'),
  resourceUrl: z.string().url().max(2_048),
  method: z.enum(['GET', 'POST']).optional(),
  environment: z.enum(['sandbox', 'production']).optional(),
})

export const supplySourceInputSchema = supplySourceTransportSchema as z.ZodType<SupplySourceInput>

const authenticationSchema: z.ZodType<SourceAuthenticationRequirement> = z.union([
  z.strictObject({ kind: z.literal('public') }),
  z.strictObject({
    kind: z.literal('api_key'),
    location: z.enum(['header', 'query']),
    name: z.string(),
  }),
  z.strictObject({ kind: z.literal('http_bearer') }),
  z.strictObject({ kind: z.literal('mcp_oauth') }),
  z.strictObject({ kind: z.literal('x402_wallet') }),
  z.strictObject({ kind: z.literal('unsupported') }),
])
const jsonObjectSchema = z.record(z.string(), jsonValueSchema)
const refusalReasonSchema = z.string() as z.ZodType<CapabilityPublicationImportRefusal>
const candidateSchema: z.ZodType<SupplyToolCandidate> = z.strictObject({
  candidateRef: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  sourceSelector: z.strictObject({ resourceUrl: z.string().url(), method: z.enum(['GET', 'POST']) }),
  title: z.string(),
  description: z.string(),
  inputSchema: jsonObjectSchema.optional(),
  outputSchema: jsonObjectSchema.optional(),
  authentication: authenticationSchema,
  validationExampleAvailable: z.boolean(),
  x402: z.strictObject({
    scheme: z.string(),
    network: z.string(),
    amount: z.string(),
    asset: z.string(),
    payTo: z.string(),
    environment: z.enum(['sandbox', 'production']),
  }).optional(),
  disposition: z.union([
    z.strictObject({ kind: z.literal('supported') }),
    z.strictObject({ kind: z.literal('unsupported'), reason: refusalReasonSchema }),
  ]),
})
export const supplySourcePreviewSchema: z.ZodType<SupplySourcePreview> = z.union([
  z.strictObject({
    kind: z.literal('ready'),
    sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    sourceRevision: z.string(),
    provenance: z.strictObject({
      sourceKind: z.literal('x402'),
      sourceUrl: z.string().url(),
      authority: z.literal('observed_external'),
    }),
    authentication: z.array(authenticationSchema),
    candidates: z.array(candidateSchema).max(128),
  }),
  z.strictObject({
    kind: z.literal('action_required'),
    ownerHandoff: z.strictObject({
      actor: z.literal('business_owner'),
      reason: z.enum(['source_attention_required', 'payee_proof_required', 'business_unavailable', 'provider_connections_unavailable']),
      destination: z.string().startsWith('/owner/').max(2_048),
      ctaLabel: z.string(),
      description: z.string(),
      title: z.string(),
    }),
  }),
])

export async function previewSupplySource(
  input: SupplySourceInput,
  dependencies: SupplySourcePreviewDependencies = {},
): Promise<SupplySourcePreview> {
  const resourceUrl = validHttpsUrl(input.resourceUrl)
  if (resourceUrl === undefined) {
    return sourceCorrection(
      'x402 URL invalid',
      'Enter the public HTTPS URL of the x402 endpoint, then preview it again.',
    )
  }
  return await previewX402Source({ ...input, resourceUrl }, dependencies)
}

async function previewX402Source(
  input: SupplySourceInput & Readonly<{ resourceUrl: string }>,
  dependencies: SupplySourcePreviewDependencies,
): Promise<SupplySourcePreview> {
  const methods: readonly ('GET' | 'POST')[] = input.method === undefined ? ['GET', 'POST'] : [input.method]
  const inspected: Array<Readonly<{ method: 'GET' | 'POST'; inspection: X402SellerEndpointInspection }>> = []
  for (const method of methods) {
    try {
      inspected.push({
        method,
        inspection: await (dependencies.inspectX402 ?? inspectX402SellerEndpoint)({
          endpointUrl: input.resourceUrl,
          method,
          deriveAeEnvironment: true,
        }),
      })
    } catch (cause) {
      return degradeBackend(
        cause,
        sourceCorrection('x402 source unavailable', 'Make the x402 resource available at the same public HTTPS URL, then preview it again.'),
        { site: 'previewX402Source', reason: 'source_unavailable' },
      )
    }
  }

  const payable = inspected.filter((entry) => (
    entry.inspection.kind === 'observed' && entry.inspection.payment.selection.kind === 'selected'
  ))
  if (input.method === undefined && payable.length > 1) {
    return sourceCorrection(
      'Choose the request method',
      'Both GET and POST returned an x402 payment challenge. Choose one method, then preview again.',
    )
  }
  const chosen = payable[0] ?? inspected.find((entry) => entry.inspection.kind === 'refused') ?? inspected[0]
  if (chosen === undefined) {
    return sourceCorrection('x402 source unavailable', 'Make the x402 resource available at the same public HTTPS URL, then preview it again.')
  }
  if (chosen.inspection.kind === 'refused') {
    return sourceCorrection('x402 source needs attention', chosen.inspection.action)
  }
  return x402CandidatePreview(chosen.inspection, chosen.method, input.environment)
}

function x402CandidatePreview(
  inspection: Extract<X402SellerEndpointInspection, { kind: 'observed' }>,
  method: 'GET' | 'POST',
  declaredEnvironment: SupplySourceInput['environment'],
): SupplySourcePreview {
  const selection = inspection.payment.selection
  const selected = selection.kind === 'selected'
    ? inspection.payment.accepts.find(({ alternativeId }) => alternativeId === selection.alternativeId)
    : undefined
  const environment = selected === undefined ? undefined : environmentForNetwork(selected.network)
  if (declaredEnvironment !== undefined && environment !== undefined && declaredEnvironment !== environment) {
    return sourceCorrection(
      'Payment network mismatch',
      `This endpoint's payment challenge is ${environment === 'sandbox' ? 'Base Sepolia sandbox' : 'Base mainnet production'}. The network in the challenge decides the environment.`,
    )
  }
  const discovery = inspection.discovery
  const supported = selected !== undefined && environment !== undefined && discovery.kind === 'admitted'
  const refusalReason: CapabilityPublicationImportRefusal = selected === undefined || environment === undefined
    ? 'payment_execution_unsupported'
    : discovery.kind === 'refused'
      ? discovery.reason
      : 'schema_missing'
  const selector = { resourceUrl: inspection.endpoint.url, method }
  const title = discovery.kind === 'admitted'
    ? `x402 ${method} ${new URL(inspection.endpoint.url).hostname}`
    : `x402 ${method} ${new URL(inspection.endpoint.url).hostname}`
  const candidate: SupplyToolCandidate = {
    candidateRef: canonicalDigest({ sourceDigest: inspection.digest, selector }),
    sourceSelector: selector,
    title,
    description: `Paid ${method} Tool discovered from the live x402 payment challenge.`,
    ...(discovery.kind === 'admitted'
      ? { inputSchema: discovery.inputSchema, outputSchema: discovery.outputSchema }
      : {}),
    authentication: { kind: 'x402_wallet' },
    validationExampleAvailable: discovery.kind === 'admitted',
    ...(selected === undefined || environment === undefined ? {} : {
      x402: {
        scheme: selected.scheme,
        network: selected.network,
        amount: selected.amount,
        asset: selected.asset,
        payTo: selected.payTo,
        environment,
      },
    }),
    disposition: supported
      ? { kind: 'supported' }
      : { kind: 'unsupported', reason: refusalReason },
  }
  return {
    kind: 'ready',
    sourceDigest: inspection.digest,
    sourceRevision: `x402:${inspection.digest}`,
    provenance: {
      sourceKind: 'x402',
      sourceUrl: inspection.endpoint.url,
      authority: 'observed_external',
    },
    authentication: [{ kind: 'x402_wallet' }],
    candidates: [candidate],
  }
}

function environmentForNetwork(network: string): 'sandbox' | 'production' | undefined {
  if (network === BASE_SEPOLIA_NETWORK) return 'sandbox'
  if (network === BASE_MAINNET_NETWORK) return 'production'
  return undefined
}

function sourceCorrection(
  title: string,
  description: string,
  destination = '/owner/operations/new',
  ctaLabel = 'Check source',
): SupplySourcePreview {
  return {
    kind: 'action_required',
    ownerHandoff: {
      actor: 'business_owner',
      reason: 'source_attention_required',
      destination,
      ctaLabel,
      description,
      title,
    },
  }
}
