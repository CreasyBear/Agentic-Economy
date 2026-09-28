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

/** Examples clarify open maps, but cannot define the callable children of a required object. */
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
      instruction: 'Name the accepted fields of a required object in the source schema; for an optional opaque object, publish a source-verified, non-empty schema-valid inputExamples instance or constrain its schema. Then re-validate and republish.',
    }],
  }
}

function findOpaqueInput(
  schema: Readonly<Record<string, JsonValue>>,
  examples: readonly CapabilityInputExample[],
  segments: readonly string[] = [],
  required = false,
): readonly string[] | undefined {
  if (schema.type !== 'object') return undefined
  const properties = isRecord(schema.properties) ? schema.properties : {}
  if (Object.keys(properties).length === 0 && schema.const === undefined && schema.enum === undefined) {
    const hasDeclaredChildren = isRecord(schema.additionalProperties)
      || (isRecord(schema.patternProperties) && Object.keys(schema.patternProperties).length > 0)
      || ['allOf', 'anyOf', 'oneOf'].some((key) => Array.isArray(schema[key]) && schema[key].length > 0)
    if (required && !hasDeclaredChildren) return segments
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
    const missing = findOpaqueInput(child, examples, [...segments, key], Array.isArray(schema.required) && schema.required.includes(key))
    if (missing !== undefined) return missing
  }
  return undefined
}
