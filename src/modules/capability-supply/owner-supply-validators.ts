import { v, type Infer } from 'convex/values'

/**
 * Owner readback validators and bounded parsing helpers.
 *
 * Admission source material is owned by the canonical capabilitySupply
 * mutation; this module must not define a second source or pricing schema.
 */



export function isOwnerSupplyRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}


export const ownerSupplyAccessPathDescriptorValue = v.union(
  v.object({
    kind: v.literal('human_request'),
    channel: v.union(v.literal('phone'), v.literal('website')),
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
    const channel = ownerSupplyLiteral(value.channel, ['phone', 'website'] as const, 'access channel')
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
  v.literal('admission'),
  v.literal('readiness'),
  v.literal('test'),
)
export const ownerSupplyResultStepValue = v.union(ownerSupplyStepValue, v.literal('unknown'))
export type OwnerSupplyStep = Infer<typeof ownerSupplyStepValue>
export function isOwnerSupplyStep(value: unknown): value is OwnerSupplyStep {
  return value === 'describe'
    || value === 'admission'
    || value === 'readiness'
    || value === 'test'
}

