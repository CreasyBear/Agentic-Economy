import Ajv2020 from 'ajv/dist/2020.js'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export const CAPABILITY_CONTRACT_FORMAT = 'ae.capability-contract:v2' as const
export const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema' as const

const MAX_SCHEMA_BYTES = 131_072
const MAX_SCHEMA_DEPTH = 64

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | Readonly<{ [key: string]: JsonValue }>

const identifier = z.string().trim().min(1).max(200)
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]))
const jsonSchema = z.record(z.string(), jsonValueSchema).superRefine((schema, context) => {
  if (schema.$schema !== JSON_SCHEMA_2020_12) {
    context.addIssue({ code: 'custom', message: 'json_schema_dialect_invalid' })
  }
  if (containsRemoteSchemaReference(schema)) {
    context.addIssue({ code: 'custom', message: 'json_schema_remote_reference_unsupported' })
  }
  if (containsUnsupportedReference(schema)) {
    context.addIssue({ code: 'custom', message: 'json_schema_reference_profile_unsupported' })
  }
})
const customerAnnotation = z.object({
  annotationId: identifier,
  document: z.enum(['input', 'output']),
  pointer: z.string().startsWith('/').max(500),
  label: z.string().trim().min(1).max(160),
  role: z.enum(['request', 'constraint', 'comparison', 'commitment', 'result', 'completion_evidence', 'recovery']),
}).strict()
const dataUse = z.object({
  effectId: identifier,
  inputPointer: z.string().startsWith('/').max(500),
  classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
  phase: z.enum(['preparation', 'execution']),
  recipient: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('candidate_binding') }).strict(),
    z.object({ kind: z.literal('selected_binding') }).strict(),
    z.object({ kind: z.literal('named_recipient'), recipientId: identifier }).strict(),
  ]),
  purposes: z.array(identifier).min(1).max(16),
}).strict()
const effect = z.object({
  effectId: identifier,
  class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
  authority: z.enum(['none', 'explicit', 'mandate_or_explicit']),
  reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
}).strict()
const evidence = z.object({
  evidenceId: identifier,
  outputPointer: z.string().startsWith('/').max(500),
  purpose: z.enum(['comparison', 'completion', 'recovery']),
}).strict()
const lifecycle = z.object({
  idempotency: z.enum(['not_applicable', 'required']),
  recovery: z.enum(['retry_safe', 'reconcile_required']),
}).strict()
const contractDocumentSchema = z.object({
  contractFormat: z.literal(CAPABILITY_CONTRACT_FORMAT),
  capabilityId: identifier.regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1_000),
  inputSchema: jsonSchema,
  outputSchema: jsonSchema,
  customerAnnotations: z.array(customerAnnotation).min(1).max(128),
  dataUse: z.array(dataUse).max(128),
  effects: z.array(effect).max(64),
  evidence: z.array(evidence).min(1).max(64),
  lifecycle,
}).strict()

export type CapabilityContractDocument = Readonly<z.infer<typeof contractDocumentSchema>>
export type CapabilityContractRef = Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}>
export type CapabilityContract = CapabilityContractDocument & Readonly<{ ref: CapabilityContractRef }>

export function defineCapabilityContract(input: unknown): CapabilityContract {
  const parsed = contractDocumentSchema.safeParse(input)
  if (!parsed.success) throw new Error('capability_contract_invalid')
  const document = parsed.data
  assertSchemaIsSafeAndValid(document.inputSchema)
  assertSchemaIsSafeAndValid(document.outputSchema)
  assertUniqueSemanticIds(document)
  assertLifecycleIsConsistent(document.lifecycle)
  if (document.effects.some((declaredEffect) => declaredEffect.authority === 'none')) {
    throw new Error('capability_material_effect_requires_authority')
  }
  const effectsById = new Map(document.effects.map((declaredEffect) => [declaredEffect.effectId, declaredEffect]))
  if (document.dataUse.some((declaration) => effectsById.get(declaration.effectId)?.class !== 'data_release')) {
    throw new Error('capability_data_use_effect_not_declared')
  }
  const declaredDataUseEffects = new Set(document.dataUse.map((declaration) => declaration.effectId))
  if (document.effects.some((declaredEffect) => declaredEffect.class === 'data_release' && !declaredDataUseEffects.has(declaredEffect.effectId))) {
    throw new Error('capability_data_effect_use_not_declared')
  }
  if (document.dataUse.some((declaration) => !instancePointerExists(document.inputSchema, declaration.inputPointer))) {
    throw new Error('capability_data_use_pointer_invalid')
  }
  if (!schemaIsClosedObject(document.inputSchema, document.inputSchema, new Set())) {
    throw new Error('capability_input_schema_profile_invalid')
  }
  if (declaredTopLevelProperties(document.inputSchema, document.inputSchema, new Set()).some((property) => (
    !document.dataUse.some((declaration) => pointerCovers(declaration.inputPointer, `/${escapePointerSegment(property)}`))
  ))) {
    throw new Error('capability_input_disclosure_undeclared')
  }
  if (document.evidence.some((requirement) => !instancePointerExists(document.outputSchema, requirement.outputPointer))) {
    throw new Error('capability_evidence_pointer_invalid')
  }
  if (document.customerAnnotations.some((annotation) => {
    const schema = annotation.document === 'input' ? document.inputSchema : document.outputSchema
    return !instancePointerExists(schema, annotation.pointer)
  })) {
    throw new Error('capability_customer_annotation_pointer_invalid')
  }
  if (document.customerAnnotations.some((annotation) => (
    annotation.document === 'input'
    && !document.dataUse.some((declaration) => pointerCovers(declaration.inputPointer, annotation.pointer))
  ))) {
    throw new Error('capability_input_disclosure_undeclared')
  }
  const completionEvidence = document.evidence.filter((requirement) => requirement.purpose === 'completion')
  if (completionEvidence.length === 0) throw new Error('capability_completion_evidence_missing')
  if (completionEvidence.some((requirement) => !document.customerAnnotations.some((annotation) => (
    annotation.document === 'output'
    && annotation.pointer === requirement.outputPointer
    && annotation.role === 'completion_evidence'
  )))) {
    throw new Error('capability_completion_evidence_annotation_missing')
  }
  if (completionEvidence.some((requirement) => !instancePointerStatus(document.outputSchema, requirement.outputPointer).guaranteed)) {
    throw new Error('capability_completion_evidence_not_guaranteed')
  }
  const ref = {
    capabilityId: document.capabilityId,
    version: document.version,
    contractDigest: canonicalDigest(document as StableHashValue),
  }
  return deepFreeze({ ...document, ref }) as CapabilityContract
}

function assertSchemaIsSafeAndValid(schema: Readonly<Record<string, JsonValue>>): void {
  if (JSON.stringify(schema).length > MAX_SCHEMA_BYTES || jsonDepth(schema) > MAX_SCHEMA_DEPTH || hasReferenceCycle(schema)) {
    throw new Error('capability_json_schema_too_complex')
  }
  try {
    new Ajv2020({ allErrors: true, allowUnionTypes: true, strict: true, validateFormats: false }).compile(schema)
  } catch {
    throw new Error('capability_json_schema_invalid')
  }
}

function assertUniqueSemanticIds(document: CapabilityContractDocument): void {
  for (const ids of [
    document.customerAnnotations.map((annotation) => annotation.annotationId),
    document.effects.map((declaredEffect) => declaredEffect.effectId),
    document.evidence.map((requirement) => requirement.evidenceId),
  ]) {
    if (new Set(ids).size !== ids.length) throw new Error('capability_semantic_id_duplicate')
  }
}

function assertLifecycleIsConsistent(value: CapabilityContractDocument['lifecycle']): void {
  const retryHasIdempotency = value.recovery !== 'retry_safe' || value.idempotency === 'required'
  if (!retryHasIdempotency) throw new Error('capability_lifecycle_inconsistent')
}

function jsonDepth(value: JsonValue, depth = 0): number {
  if (value === null || typeof value !== 'object') return depth
  const nested = Array.isArray(value) ? value : Object.values(value)
  return nested.reduce((maximum, item) => Math.max(maximum, jsonDepth(item, depth + 1)), depth)
}

function containsRemoteSchemaReference(schema: Readonly<Record<string, JsonValue>>): boolean {
  for (const keyword of ['$ref', '$dynamicRef'] as const) {
    const reference = schema[keyword]
    if (reference !== undefined && (typeof reference !== 'string' || !reference.startsWith('#'))) return true
  }
  return childSchemas(schema).some((child) => containsRemoteSchemaReference(child))
}

function containsUnsupportedReference(schema: Readonly<Record<string, JsonValue>>): boolean {
  const reference = schema.$ref
  if (reference !== undefined && (typeof reference !== 'string' || !reference.startsWith('#/'))) return true
  if (schema.$dynamicRef !== undefined) return true
  return childSchemas(schema).some((child) => containsUnsupportedReference(child))
}

function hasReferenceCycle(root: Readonly<Record<string, JsonValue>>): boolean {
  function visit(schema: Readonly<Record<string, JsonValue>>, activeReferences: ReadonlySet<string>): boolean {
    const reference = schema.$ref
    if (typeof reference === 'string' && reference.startsWith('#/')) {
      if (activeReferences.has(reference)) return true
      const target = resolveSchemaReference(root, reference)
      if (target !== undefined && visit(target, new Set([...activeReferences, reference]))) return true
    }
    return childSchemas(schema).some((child) => visit(child, activeReferences))
  }
  return visit(root, new Set())
}

function childSchemas(schema: Readonly<Record<string, JsonValue>>): ReadonlyArray<Readonly<Record<string, JsonValue>>> {
  const children: Array<Readonly<Record<string, JsonValue>>> = []
  for (const keyword of ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas'] as const) {
    const schemaMap = schema[keyword]
    if (isJsonRecord(schemaMap)) children.push(...Object.values(schemaMap).filter(isJsonRecord))
  }
  for (const keyword of ['additionalProperties', 'unevaluatedProperties', 'propertyNames', 'contains', 'contentSchema', 'if', 'then', 'else', 'not', 'items', 'unevaluatedItems'] as const) {
    const child = schema[keyword]
    if (isJsonRecord(child)) children.push(child)
  }
  for (const keyword of ['prefixItems', 'allOf', 'anyOf', 'oneOf'] as const) {
    const nested = schema[keyword]
    if (Array.isArray(nested)) children.push(...nested.filter(isJsonRecord))
  }
  return children
}

function instancePointerExists(schema: Readonly<Record<string, JsonValue>>, pointer: string): boolean {
  return instancePointerStatus(schema, pointer).declared
}

function instancePointerStatus(schema: Readonly<Record<string, JsonValue>>, pointer: string): Readonly<{ declared: boolean; guaranteed: boolean }> {
  const segments = pointer.slice(1).split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
  return schemaPathStatus(schema, segments, schema, new Set())
}

function schemaPathStatus(
  schema: Readonly<Record<string, JsonValue>>,
  segments: readonly string[],
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): Readonly<{ declared: boolean; guaranteed: boolean }> {
  if (segments.length === 0) return { declared: true, guaranteed: true }
  let declared = false
  let guaranteed = false
  const reference = schema.$ref
  const referenceKey = `${String(reference)}:${segments.join('/')}`
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(referenceKey)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      const status = schemaPathStatus(target, segments, root, new Set([...seenReferences, referenceKey]))
      declared ||= status.declared
      guaranteed ||= status.guaranteed
    }
  }
  const [head, ...tail] = segments
  const properties = schema.properties
  if (isJsonRecord(properties) && head !== undefined && isJsonRecord(properties[head])) {
    const child = schemaPathStatus(properties[head], tail, root, seenReferences)
    const required = Array.isArray(schema.required) && schema.required.includes(head)
    declared ||= child.declared
    guaranteed ||= required && schemaGuaranteesType(schema, 'object', root, seenReferences) && child.guaranteed
  }
  if (head !== undefined && /^\d+$/.test(head)) {
    const index = Number(head)
    const prefixItems = schema.prefixItems
    const itemSchema = Array.isArray(prefixItems) && isJsonRecord(prefixItems[index])
      ? prefixItems[index]
      : isJsonRecord(schema.items) ? schema.items : undefined
    if (itemSchema !== undefined) {
      const child = schemaPathStatus(itemSchema, tail, root, seenReferences)
      const itemGuaranteed = typeof schema.minItems === 'number' && schema.minItems > index
      declared ||= child.declared
      guaranteed ||= itemGuaranteed && schemaGuaranteesType(schema, 'array', root, seenReferences) && child.guaranteed
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (!Array.isArray(alternatives) || alternatives.length === 0) continue
    const statuses = alternatives.map((candidate) => isJsonRecord(candidate)
      ? schemaPathStatus(candidate, segments, root, seenReferences)
      : { declared: false, guaranteed: false })
    declared ||= statuses.some((status) => status.declared)
    guaranteed ||= keyword === 'allOf'
      ? statuses.some((status) => status.guaranteed)
      : statuses.every((status) => status.guaranteed)
  }
  const thenSchema = schema.then
  const elseSchema = schema.else
  if (isJsonRecord(thenSchema) || isJsonRecord(elseSchema)) {
    const thenStatus = isJsonRecord(thenSchema) ? schemaPathStatus(thenSchema, segments, root, seenReferences) : { declared: false, guaranteed: false }
    const elseStatus = isJsonRecord(elseSchema) ? schemaPathStatus(elseSchema, segments, root, seenReferences) : { declared: false, guaranteed: false }
    declared ||= thenStatus.declared || elseStatus.declared
    guaranteed ||= thenStatus.guaranteed && elseStatus.guaranteed
  }
  return { declared, guaranteed }
}

function schemaGuaranteesType(
  schema: Readonly<Record<string, JsonValue>>,
  expected: 'array' | 'object',
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): boolean {
  const declaredType = schema.type
  if (typeof declaredType === 'string') return declaredType === expected
  if (Array.isArray(declaredType)) return declaredType.length > 0 && declaredType.every((value) => value === expected)
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined && schemaGuaranteesType(target, expected, root, new Set([...seenReferences, reference]))) return true
  }
  const allOf = schema.allOf
  if (Array.isArray(allOf) && allOf.some((candidate) => isJsonRecord(candidate) && schemaGuaranteesType(candidate, expected, root, seenReferences))) return true
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (Array.isArray(alternatives) && alternatives.length > 0 && alternatives.every((candidate) => (
      isJsonRecord(candidate) && schemaGuaranteesType(candidate, expected, root, seenReferences)
    ))) return true
  }
  return false
}

function schemaIsClosedObject(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): boolean {
  const patternProperties = schema.patternProperties
  const hasDynamicProperties = isJsonRecord(patternProperties) && Object.keys(patternProperties).length > 0
  if (schema.type === 'object' && schema.additionalProperties === false && !hasDynamicProperties) return true
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined && schemaIsClosedObject(target, root, new Set([...seenReferences, reference]))) return true
  }
  const allOf = schema.allOf
  if (Array.isArray(allOf) && allOf.some((candidate) => isJsonRecord(candidate) && schemaIsClosedObject(candidate, root, seenReferences))) return true
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (Array.isArray(alternatives) && alternatives.length > 0 && alternatives.every((candidate) => (
      isJsonRecord(candidate) && schemaIsClosedObject(candidate, root, seenReferences)
    ))) return true
  }
  return false
}

function declaredTopLevelProperties(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): readonly string[] {
  const properties = new Set<string>()
  if (isJsonRecord(schema.properties)) {
    for (const property of Object.keys(schema.properties)) properties.add(property)
  }
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      for (const property of declaredTopLevelProperties(target, root, new Set([...seenReferences, reference]))) properties.add(property)
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (!Array.isArray(alternatives)) continue
    for (const candidate of alternatives) {
      if (!isJsonRecord(candidate)) continue
      for (const property of declaredTopLevelProperties(candidate, root, seenReferences)) properties.add(property)
    }
  }
  return [...properties]
}

function escapePointerSegment(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function pointerCovers(parent: string, child: string): boolean {
  return parent === child || child.startsWith(`${parent}/`)
}

function resolveSchemaReference(root: Readonly<Record<string, JsonValue>>, reference: string): Readonly<Record<string, JsonValue>> | undefined {
  let current: JsonValue = root
  for (const segment of reference.slice(2).split('/').map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!isJsonRecord(current)) return undefined
    const next: JsonValue | undefined = current[segment]
    if (next === undefined) return undefined
    current = next
  }
  return isJsonRecord(current) ? current : undefined
}

function isJsonRecord(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepFreeze(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}
