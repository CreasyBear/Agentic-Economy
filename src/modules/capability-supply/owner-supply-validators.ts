import { v, type Infer } from 'convex/values'

/**
 * Canonical owner-supply validator primitives + reading helpers.
 *
 * Single source of truth for the owner-supply value validation cluster. These
 * were previously duplicated byte-for-byte in `convex/capabilitySupply.ts` and
 * `convex/capabilitySupplyOwnerSupply.ts`; keep them here so the
 * money/authority-adjacent shapes (authority, paidAmount) cannot
 * drift between the two consumer files.
 *
 * Namespaced per-step OVERALL validators (completed / advance / action /
 * publish results, funnel input) intentionally stay in each consumer file:
 * they encode genuinely different step semantics (six-step funnel vs
 * readiness/test readiness probes) that must not be merged here.
 */

export const ownerSupplyAuthorityValue = v.union(
  v.object({ kind: v.literal('keyless') }),
  v.object({ kind: v.literal('provider_connection'), connectionRef: v.string(), providerRef: v.string() }),
)

export const ownerSupplyEndpointValue = v.object({
  sourceKind: v.union(v.literal('openapi_http'), v.literal('mcp'), v.literal('agent_plugin_mcp'), v.literal('x402')),
  descriptor: v.string(),
  selector: v.string(),
  endpointUrl: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  queryMapping: v.string(),
  protocolVersion: v.string(),
  toolName: v.string(),
  requestTimeoutMs: v.number(),
  authority: ownerSupplyAuthorityValue,
})

const ownerSupplyExactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})

export const ownerSupplyPricingValue = v.object({
  version: v.literal('pricing:v2'),
  unit: v.literal('call'),
  paidAmount: ownerSupplyExactAmountValue,
  freeTier: v.optional(v.object({ maxCalls: v.number(), window: v.union(v.literal('day'), v.literal('month')) })),
})

export function isOwnerSupplyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function ownerSupplyValue(value: unknown): Record<string, unknown> {
  return isOwnerSupplyRecord(value) ? value : {}
}

export const ownerSupplyAccessPathDescriptorValue = v.union(
  v.object({
    kind: v.literal('human_request'),
    channel: v.union(v.literal('phone'), v.literal('website'), v.literal('ae_inquiry')),
    disclosure: v.string(),
    url: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal('external_operation'),
    name: v.string(),
    summary: v.string(),
    url: v.string(),
    method: v.optional(v.string()),
    documentationUrl: v.optional(v.string()),
    interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
    authenticationSummary: v.optional(v.string()),
    pricingSummary: v.optional(v.string()),
    provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
  }),
)
export type OwnerSupplyAccessPathDescriptor = Infer<typeof ownerSupplyAccessPathDescriptorValue>

export function ownerSupplyLiteral<const Values extends readonly string[]>(value: unknown, values: Values, label: string): Values[number] {
  if (typeof value === 'string' && values.some((candidate) => candidate === value)) return value as Values[number]
  throw new Error(`Invalid owner supply ${label}`)
}

export function ownerSupplyOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  throw new Error(`Invalid owner supply ${label}`)
}

export function ownerSupplyOptionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return value
  throw new Error(`Invalid owner supply ${label}`)
}

export function ownerSupplyStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Invalid owner supply ${label}`)
  const strings: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') throw new Error(`Invalid owner supply ${label}`)
    strings.push(item)
  }
  return strings
}

export function ownerSupplyAccessPathDescriptor(value: unknown): OwnerSupplyAccessPathDescriptor {
  if (!isOwnerSupplyRecord(value)) throw new Error('Invalid owner supply access path descriptor')
  if (value.kind === 'human_request') {
    const channel = ownerSupplyLiteral(value.channel, ['phone', 'website', 'ae_inquiry'] as const, 'access channel')
    const disclosure = typeof value.disclosure === 'string' ? value.disclosure : (() => { throw new Error('Invalid owner supply disclosure') })()
    const url = ownerSupplyOptionalString(value.url, 'access URL')
    return { kind: 'human_request', channel, disclosure, ...(url === undefined ? {} : { url }) }
  }
  if (value.kind === 'external_operation') {
    const name = typeof value.name === 'string' ? value.name : (() => { throw new Error('Invalid owner supply operation name') })()
    const summary = typeof value.summary === 'string' ? value.summary : (() => { throw new Error('Invalid owner supply operation summary') })()
    const url = typeof value.url === 'string' ? value.url : (() => { throw new Error('Invalid owner supply operation URL') })()
    const method = ownerSupplyOptionalString(value.method, 'operation method')
    const documentationUrl = ownerSupplyOptionalString(value.documentationUrl, 'operation documentation URL')
    const authenticationSummary = ownerSupplyOptionalString(value.authenticationSummary, 'operation authentication summary')
    const pricingSummary = ownerSupplyOptionalString(value.pricingSummary, 'operation pricing summary')
    const provenance = ownerSupplyLiteral(value.provenance, ['business_declared', 'publicly_observed'] as const, 'operation provenance')
    let interfaceDescription: { format: string; url?: string } | undefined
    if (value.interfaceDescription !== undefined) {
      if (!isOwnerSupplyRecord(value.interfaceDescription) || typeof value.interfaceDescription.format !== 'string') {
        throw new Error('Invalid owner supply interface description')
      }
      const interfaceUrl = ownerSupplyOptionalString(value.interfaceDescription.url, 'interface description URL')
      interfaceDescription = { format: value.interfaceDescription.format, ...(interfaceUrl === undefined ? {} : { url: interfaceUrl }) }
    }
    return {
      kind: 'external_operation',
      name,
      summary,
      url,
      ...(method === undefined ? {} : { method }),
      ...(documentationUrl === undefined ? {} : { documentationUrl }),
      ...(interfaceDescription === undefined ? {} : { interfaceDescription }),
      ...(authenticationSummary === undefined ? {} : { authenticationSummary }),
      ...(pricingSummary === undefined ? {} : { pricingSummary }),
      provenance,
    }
  }
  throw new Error('Invalid owner supply access path descriptor kind')
}

export const ownerSupplyStepValue = v.union(
  v.literal('describe'),
  v.literal('endpoint'),
  v.literal('readiness'),
  v.literal('pricing'),
  v.literal('test'),
  v.literal('publish'),
)
export const ownerSupplyResultStepValue = v.union(ownerSupplyStepValue, v.literal('unknown'))
export type OwnerSupplyStep = Infer<typeof ownerSupplyStepValue>
export function isOwnerSupplyStep(value: unknown): value is OwnerSupplyStep {
  return value === 'describe'
    || value === 'endpoint'
    || value === 'readiness'
    || value === 'pricing'
    || value === 'test'
    || value === 'publish'
}

export const ownerSupplyValueValidator = v.object({
  step: v.optional(ownerSupplyResultStepValue),
  endpoint: v.optional(ownerSupplyEndpointValue),
  pricing: v.optional(ownerSupplyPricingValue),
  sourceKind: v.optional(v.union(v.literal('openapi_http'), v.literal('mcp'), v.literal('agent_plugin_mcp'), v.literal('x402'))),
  descriptor: v.optional(v.string()),
  selector: v.optional(v.string()),
  endpointUrl: v.optional(v.string()),
  method: v.optional(v.union(v.literal('GET'), v.literal('POST'))),
  queryMapping: v.optional(v.string()),
  protocolVersion: v.optional(v.string()),
  toolName: v.optional(v.string()),
  requestTimeoutMs: v.optional(v.number()),
  authority: v.optional(ownerSupplyAuthorityValue),
  version: v.optional(v.literal('pricing:v2')),
  unit: v.optional(v.literal('call')),
  paidAmount: v.optional(ownerSupplyExactAmountValue),
  freeTier: v.optional(v.object({ maxCalls: v.number(), window: v.union(v.literal('day'), v.literal('month')) })),
})
