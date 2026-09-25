import {
  validateJsonSchema,
  type CapabilityContractDocument,
  type CapabilityInputExample,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'

export type CapabilityPublicationQualityNext = Readonly<{
  action: 'revise-publication'
  field: string
  instruction: string
}>

export type CapabilityPublicationQualityRefusal = Readonly<{
  kind: 'refused'
  reason: 'opaque_input_without_valid_example'
  next: readonly [CapabilityPublicationQualityNext]
}>

/** Require a concrete, schema-valid instance for each unnamed object argument. */
export function publicationInputQuality(
  contract: CapabilityContractDocument,
): CapabilityPublicationQualityRefusal | undefined {
  const validExamples = contract.inputExamples?.filter(({ input }) => validateJsonSchema(contract.inputSchema, input)) ?? []
  const opaque = findOpaqueInput(contract.inputSchema, validExamples)
  if (opaque === undefined) return undefined
  const pointer = opaque.map((segment) => `/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`).join('')
  return {
    kind: 'refused',
    reason: 'opaque_input_without_valid_example',
    next: [{
      action: 'revise-publication',
      field: `/inputSchema${pointer}`,
      instruction: 'Publish a source-verified, non-empty inputExamples instance valid for this versioned input schema, or constrain the schema to name its accepted fields; then re-validate and republish.',
    }],
  }
}

function findOpaqueInput(
  schema: Readonly<Record<string, JsonValue>>,
  examples: readonly CapabilityInputExample[],
  segments: readonly string[] = [],
): readonly string[] | undefined {
  if (schema.type !== 'object') return undefined
  const properties = isRecord(schema.properties) ? schema.properties : {}
  if (Object.keys(properties).length === 0 && schema.const === undefined && schema.enum === undefined) {
    const hasExample = examples.some(({ input }) => {
      let value: unknown = input
      for (const segment of segments) {
        if (!isRecord(value)) return false
        value = value[segment]
      }
      return isRecord(value) && Object.keys(value).length > 0
    })
    if (!hasExample) return segments
  }
  for (const [key, child] of Object.entries(properties)) {
    if (!isRecord(child)) continue
    const missing = findOpaqueInput(child, examples, [...segments, key])
    if (missing !== undefined) return missing
  }
  return undefined
}
