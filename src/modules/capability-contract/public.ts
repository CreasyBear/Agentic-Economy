import Ajv2020 from 'ajv/dist/2020.js'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export const CAPABILITY_CONTRACT_FORMAT = 'ae.capability-contract:v2' as const
export const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema' as const

const MAX_SCHEMA_BYTES = 131_072
const MAX_SCHEMA_DEPTH = 64
const MAX_VALIDATION_ISSUES = 32
const MAX_INPUT_FACTS = 128
const MAX_COMPILED_CONTRACTS = 32
const MAX_COMPILED_POINTED_SCHEMAS = 128
const MAX_VALIDATED_VALUE_NODES = 10_000
const MAX_VALIDATED_VALUE_DEPTH = 64

type ValidationError = Readonly<{ instancePath?: string; keyword?: string; params?: Readonly<Record<string, unknown>> }>
type SchemaValidator = ((value: unknown) => boolean) & Readonly<{ errors?: readonly ValidationError[] | null }>
const compiledContracts = new Map<string, Readonly<{ input: SchemaValidator; output: SchemaValidator }>>()
const compiledPointedSchemas = new Map<string, SchemaValidator>()
const definedContracts = new WeakSet<object>()

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
  pointer: z.string().startsWith('/').max(500).refine(pointerSyntaxIsCanonical),
  label: z.string().trim().min(1).max(160),
  role: z.enum(['request', 'constraint', 'comparison', 'commitment', 'result', 'completion_evidence', 'recovery']),
}).strict()
const dataUse = z.object({
  effectId: identifier,
  inputPointer: z.string().startsWith('/').max(500).refine(pointerSyntaxIsCanonical),
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
  outputPointer: z.string().startsWith('/').max(500).refine(pointerSyntaxIsCanonical),
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

declare const capabilitySelectionKeyBrand: unique symbol
declare const capabilityInputKeyBrand: unique symbol
declare const pointedSchemaIdentityBrand: unique symbol

export type CapabilitySelectionKey = string & Readonly<{ [capabilitySelectionKeyBrand]: true }>
export type CapabilityInputKey = string & Readonly<{ [capabilityInputKeyBrand]: true }>
export type PointedSchemaIdentity = string & Readonly<{ [pointedSchemaIdentityBrand]: true }>
export type CapabilityInputStage = 'option_selection' | 'commitment'
export type CapabilityInputSemantic = Readonly<{
  key: CapabilityInputKey
  annotationId: string
  inputPointer: string
  label: string
  role: 'request' | 'constraint' | 'comparison' | 'commitment'
  stage: CapabilityInputStage
  required: boolean
  schemaIdentity: PointedSchemaIdentity
  dataUse: CapabilityContractDocument['dataUse']
}>
export type CapabilityEvidenceSemantic = Readonly<{
  evidenceId: string
  outputPointer: string
  purpose: 'comparison' | 'completion' | 'recovery'
  annotationId: string
  label: string
  role: 'comparison' | 'completion_evidence' | 'recovery'
  guaranteed: boolean
  schemaIdentity: PointedSchemaIdentity
}>
export type CapabilityValidationIssue = Readonly<{ instancePointer: string; keyword: string }>
export type CapabilityDocumentValidation =
  | Readonly<{ kind: 'valid'; value: JsonValue }>
  | Readonly<{ kind: 'invalid'; issues: readonly CapabilityValidationIssue[]; truncated: boolean }>
export type CapabilityInputFact = Readonly<{
  input: CapabilityInputKey
  inputPointer: string
  value: JsonValue
}>
export type CapabilityInputAssessment =
  | Readonly<{ kind: 'viable'; stage: 'option_selection' }>
  | Readonly<{ kind: 'viable'; stage: 'commitment'; input: JsonValue }>
  | Readonly<{ kind: 'needs_information'; missing: readonly CapabilityInputSemantic[] }>
  | Readonly<{ kind: 'incompatible'; issues: readonly Readonly<{ inputPointer?: string; keyword: string }>[] }>
export type CapabilityDecisionModel = Readonly<{
  contractRef: CapabilityContractRef
  selectionKey: CapabilitySelectionKey
  semanticDigest: string
  inputs: readonly CapabilityInputSemantic[]
  evidence: readonly CapabilityEvidenceSemantic[]
  assessInput: (draft: Readonly<{
    contractRef: CapabilityContractRef
    selectionKey: CapabilitySelectionKey
    stage: CapabilityInputStage
    facts: readonly CapabilityInputFact[]
  }>) => CapabilityInputAssessment
  validateInput: (value: unknown) => CapabilityDocumentValidation
  validateOutput: (value: unknown) => CapabilityDocumentValidation
}>

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
  const inputAnnotationPointers = new Set(document.customerAnnotations
    .filter((annotation) => annotation.document === 'input')
    .map((annotation) => annotation.pointer))
  if (!inputSchemaSupportsStageProjection(document.inputSchema, document.inputSchema, '', inputAnnotationPointers, new Set())) {
    throw new Error('capability_input_schema_projection_invalid')
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
  assertCustomerAnnotationsAreProjectable(document)
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
  assertEvidenceAnnotationsCompatible(document)
  assertSemanticPointersProjectable(document)
  const ref = {
    capabilityId: document.capabilityId,
    version: document.version,
    contractDigest: canonicalDigest(document as StableHashValue),
  }
  const contract = deepFreeze({ ...document, ref }) as CapabilityContract
  definedContracts.add(contract)
  return contract
}

export function sameCapabilityContractRef(left: CapabilityContractRef, right: CapabilityContractRef): boolean {
  return left.capabilityId === right.capabilityId
    && left.version === right.version
    && left.contractDigest === right.contractDigest
}

export function samePointedSchema(left: PointedSchemaIdentity, right: PointedSchemaIdentity): boolean {
  return left === right
}

export function openCapabilityDecisionModel(contract: CapabilityContract): CapabilityDecisionModel {
  let exactContract = contract
  if (!definedContracts.has(contract)) {
    const { ref: suppliedRef, ...suppliedDocument } = contract
    const verifiedContract = defineCapabilityContract(suppliedDocument)
    if (!sameCapabilityContractRef(suppliedRef, verifiedContract.ref)) {
      throw new Error('capability_contract_ref_mismatch')
    }
    exactContract = verifiedContract
  }
  const selectionKey = `ae_selection:${canonicalDigest(exactContract.ref as StableHashValue)}` as CapabilitySelectionKey
  const inputAnnotations = exactContract.customerAnnotations
    .filter((annotation) => annotation.document === 'input')
    .sort((left, right) => left.pointer.localeCompare(right.pointer))
  const inputs = inputAnnotations.map((annotation): CapabilityInputSemantic => {
    const pointedSchema = resolvePointedSchema(exactContract.inputSchema, annotation.pointer)
    if (pointedSchema === undefined) throw new Error('capability_semantic_projection_failed')
    return {
      key: `ae_input:${canonicalDigest({ ref: exactContract.ref, inputPointer: annotation.pointer } as StableHashValue)}` as CapabilityInputKey,
      annotationId: annotation.annotationId,
      inputPointer: annotation.pointer,
      label: annotation.label,
      role: annotation.role as CapabilityInputSemantic['role'],
      stage: annotation.role === 'commitment' ? 'commitment' : 'option_selection',
      required: instancePointerStatus(exactContract.inputSchema, annotation.pointer).guaranteed,
      schemaIdentity: canonicalDigest(pointedSchema as StableHashValue) as PointedSchemaIdentity,
      dataUse: exactContract.dataUse.filter((declaration) => pointerCovers(declaration.inputPointer, annotation.pointer)),
    }
  })
  const evidence = exactContract.evidence.map((requirement): CapabilityEvidenceSemantic => {
    const annotation = exactContract.customerAnnotations.find((candidate) => (
      candidate.document === 'output' && candidate.pointer === requirement.outputPointer
    ))
    const pointedSchema = resolvePointedSchema(exactContract.outputSchema, requirement.outputPointer)
    if (annotation === undefined || pointedSchema === undefined) throw new Error('capability_semantic_projection_failed')
    return {
      evidenceId: requirement.evidenceId,
      outputPointer: requirement.outputPointer,
      purpose: requirement.purpose,
      annotationId: annotation.annotationId,
      label: annotation.label,
      role: annotation.role as CapabilityEvidenceSemantic['role'],
      guaranteed: instancePointerStatus(exactContract.outputSchema, requirement.outputPointer).guaranteed,
      schemaIdentity: canonicalDigest(pointedSchema as StableHashValue) as PointedSchemaIdentity,
    }
  }).sort((left, right) => left.outputPointer.localeCompare(right.outputPointer))
  const inputValidator = compiledValidator(exactContract, 'input')
  const outputValidator = compiledValidator(exactContract, 'output')
  const inputValidators = new Map(inputs.map((input) => {
    const schema = resolvePointedSchema(exactContract.inputSchema, input.inputPointer)
    if (schema === undefined) throw new Error('capability_semantic_projection_failed')
    return [input.key, compiledPointedValidator(input.schemaIdentity, schema)]
  }))
  const model: CapabilityDecisionModel = {
    contractRef: exactContract.ref,
    selectionKey,
    semanticDigest: canonicalDigest({ contractRef: contract.ref, inputs, evidence } as StableHashValue),
    inputs,
    evidence,
    assessInput: (draft) => assessCapabilityInput({
      contractRef: exactContract.ref,
      selectionKey,
      inputs,
      inputValidators,
      inputValidator,
    }, draft),
    validateInput: (value) => validateDocument(inputValidator, value),
    validateOutput: (value) => validateDocument(outputValidator, value),
  }
  return deepFreeze(model) as CapabilityDecisionModel
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

function assertCustomerAnnotationsAreProjectable(document: CapabilityContractDocument): void {
  const inputRoles = new Set(['request', 'constraint', 'comparison', 'commitment'])
  const outputRoles = new Set(['comparison', 'result', 'completion_evidence', 'recovery'])
  if (document.customerAnnotations.some((annotation) => (
    annotation.document === 'input' ? !inputRoles.has(annotation.role) : !outputRoles.has(annotation.role)
  ))) {
    throw new Error('capability_customer_annotation_role_invalid')
  }
  const pointerKeys = document.customerAnnotations.map((annotation) => `${annotation.document}:${annotation.pointer}`)
  if (new Set(pointerKeys).size !== pointerKeys.length) {
    throw new Error('capability_customer_annotation_pointer_ambiguous')
  }
  const inputPointers = document.customerAnnotations
    .filter((annotation) => annotation.document === 'input')
    .map((annotation) => annotation.pointer)
  if (inputPointers.some((pointer, index) => inputPointers.some((other, otherIndex) => (
    index !== otherIndex && pointerCovers(pointer, other)
  )))) {
    throw new Error('capability_customer_annotation_pointer_ambiguous')
  }
  const requiredPointers = requiredInputPointers(document.inputSchema, document.inputSchema, '', new Set())
  if (requiredPointers.some((requiredPointer) => {
    return !document.customerAnnotations.some((annotation) => (
      annotation.document === 'input' && pointerCovers(annotation.pointer, requiredPointer)
    ))
  })) {
    throw new Error('capability_required_input_annotation_missing')
  }
}

function assertEvidenceAnnotationsCompatible(document: CapabilityContractDocument): void {
  if (document.evidence.some((requirement) => {
    const matches = document.customerAnnotations.filter((annotation) => (
      annotation.document === 'output' && annotation.pointer === requirement.outputPointer
    ))
    const expectedRole = requirement.purpose === 'completion' ? 'completion_evidence' : requirement.purpose
    return matches.length !== 1 || matches[0]?.role !== expectedRole
  })) {
    throw new Error('capability_evidence_annotation_invalid')
  }
}

function assertSemanticPointersProjectable(document: CapabilityContractDocument): void {
  for (const annotation of document.customerAnnotations) {
    const root = annotation.document === 'input' ? document.inputSchema : document.outputSchema
    const schema = resolvePointedSchema(root, annotation.pointer)
    if (schema === undefined || !schemaCompilesIndependently(schema)) {
      throw new Error('capability_semantic_projection_invalid')
    }
  }
}

function schemaCompilesIndependently(schema: Readonly<Record<string, JsonValue>>): boolean {
  try {
    new Ajv2020({
      allErrors: true,
      allowUnionTypes: true,
      strict: true,
      validateFormats: false,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    }).compile(schema)
    return true
  } catch {
    return false
  }
}

function inputSchemaSupportsStageProjection(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  pointer: string,
  annotationPointers: ReadonlySet<string>,
  seenReferences: ReadonlySet<string>,
): boolean {
  if (pointer.length > 0 && annotationPointers.has(pointer)) return true
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const siblings = Object.keys(schema).filter((key) => !['$schema', '$defs', 'definitions', '$ref'].includes(key))
    const target = resolveSchemaReference(root, reference)
    return siblings.length === 0
      && target !== undefined
      && inputSchemaSupportsStageProjection(target, root, pointer, annotationPointers, new Set([...seenReferences, reference]))
  }
  const crossInputKeywords = [
    'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else',
    'dependentRequired', 'dependentSchemas', 'minProperties', 'maxProperties',
    'patternProperties', 'propertyNames', 'unevaluatedProperties', 'const', 'enum',
  ]
  if (crossInputKeywords.some((keyword) => schema[keyword] !== undefined)) return false
  if (!isJsonRecord(schema.properties)) return true
  return Object.entries(schema.properties).every(([property, child]) => {
    const childPointer = `${pointer}/${escapePointerSegment(property)}`
    const hasSemanticDescendant = [...annotationPointers].some((candidate) => pointerCovers(childPointer, candidate))
    return !hasSemanticDescendant || !isJsonRecord(child)
      || inputSchemaSupportsStageProjection(child, root, childPointer, annotationPointers, seenReferences)
  })
}

function pointerSyntaxIsCanonical(pointer: string): boolean {
  if (!pointer.startsWith('/')) return false
  return pointer.slice(1).split('/').every((segment) => (
    segment.length > 0
    && !/~(?:[^01]|$)/.test(segment)
    && !/^(?:0|[1-9]\d*)$/.test(segment.replaceAll('~1', '/').replaceAll('~0', '~'))
  ))
}

function requiredInputPointers(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  prefix: string,
  seenReferences: ReadonlySet<string>,
): readonly string[] {
  const pointers = new Set<string>()
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      for (const pointer of requiredInputPointers(target, root, prefix, new Set([...seenReferences, reference]))) pointers.add(pointer)
    }
  }
  if (Array.isArray(schema.required) && isJsonRecord(schema.properties)) {
    for (const property of schema.required) {
      if (typeof property !== 'string') continue
      const pointer = `${prefix}/${escapePointerSegment(property)}`
      const child = schema.properties[property]
      const nested = isJsonRecord(child)
        ? requiredInputPointers(child, root, pointer, seenReferences)
        : []
      if (nested.length === 0) pointers.add(pointer)
      else for (const nestedPointer of nested) pointers.add(nestedPointer)
    }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const alternatives = schema[keyword]
    if (!Array.isArray(alternatives)) continue
    const sets = alternatives.filter(isJsonRecord).map((candidate) => new Set(requiredInputPointers(candidate, root, prefix, seenReferences)))
    if (keyword === 'allOf') {
      for (const set of sets) for (const pointer of set) pointers.add(pointer)
    } else if (sets.length > 0) {
      for (const pointer of sets[0] ?? []) if (sets.every((set) => set.has(pointer))) pointers.add(pointer)
    }
  }
  return [...pointers]
}

function compiledValidator(contract: CapabilityContract, document: 'input' | 'output'): SchemaValidator {
  const cacheKey = `${contract.ref.capabilityId}:${contract.ref.version}:${contract.ref.contractDigest}`
  let cached = compiledContracts.get(cacheKey)
  if (cached === undefined) {
    const ajv = new Ajv2020({
      allErrors: true,
      allowUnionTypes: true,
      strict: true,
      validateFormats: false,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    })
    cached = {
      input: ajv.compile(contract.inputSchema) as SchemaValidator,
      output: ajv.compile(contract.outputSchema) as SchemaValidator,
    }
    compiledContracts.set(cacheKey, cached)
    if (compiledContracts.size > MAX_COMPILED_CONTRACTS) {
      const oldestKey = compiledContracts.keys().next().value
      if (typeof oldestKey === 'string') compiledContracts.delete(oldestKey)
    }
  } else {
    compiledContracts.delete(cacheKey)
    compiledContracts.set(cacheKey, cached)
  }
  return cached[document]
}

function compiledPointedValidator(
  identity: PointedSchemaIdentity,
  schema: Readonly<Record<string, JsonValue>>,
): SchemaValidator {
  let validator = compiledPointedSchemas.get(identity)
  if (validator === undefined) {
    const ajv = new Ajv2020({
      allErrors: true,
      allowUnionTypes: true,
      strict: true,
      validateFormats: false,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
    })
    validator = ajv.compile(schema) as SchemaValidator
    compiledPointedSchemas.set(identity, validator)
    if (compiledPointedSchemas.size > MAX_COMPILED_POINTED_SCHEMAS) {
      const oldestKey = compiledPointedSchemas.keys().next().value
      if (typeof oldestKey === 'string') compiledPointedSchemas.delete(oldestKey)
    }
  } else {
    compiledPointedSchemas.delete(identity)
    compiledPointedSchemas.set(identity, validator)
  }
  return validator
}

function assessCapabilityInput(
  model: Readonly<{
    contractRef: CapabilityContractRef
    selectionKey: CapabilitySelectionKey
    inputs: readonly CapabilityInputSemantic[]
    inputValidators: ReadonlyMap<CapabilityInputKey, SchemaValidator>
    inputValidator: SchemaValidator
  }>,
  draft: Parameters<CapabilityDecisionModel['assessInput']>[0],
): CapabilityInputAssessment {
  if (!sameCapabilityContractRef(model.contractRef, draft.contractRef)) {
    return deepFreeze({ kind: 'incompatible', issues: [{ keyword: 'contract_ref_mismatch' }] }) as CapabilityInputAssessment
  }
  if (model.selectionKey !== draft.selectionKey) {
    return deepFreeze({ kind: 'incompatible', issues: [{ keyword: 'selection_key_mismatch' }] }) as CapabilityInputAssessment
  }
  if (draft.facts.length > MAX_INPUT_FACTS) {
    return deepFreeze({ kind: 'incompatible', issues: [{ keyword: 'fact_limit_exceeded' }] }) as CapabilityInputAssessment
  }
  const semanticByKey = new Map(model.inputs.map((input) => [input.key, input]))
  const seenKeys = new Set<CapabilityInputKey>()
  const seenPointers: string[] = []
  const issues: Array<Readonly<{ inputPointer?: string; keyword: string }>> = []
  const accepted: Array<Readonly<{ semantic: CapabilityInputSemantic; value: JsonValue }>> = []
  for (const fact of draft.facts) {
    if (!valueIsBoundedJson(fact.value)) {
      issues.push({ inputPointer: fact.inputPointer, keyword: 'value_too_complex' })
      if (issues.length >= MAX_VALIDATION_ISSUES) break
      continue
    }
    const semantic = semanticByKey.get(fact.input)
    if (semantic === undefined || semantic.inputPointer !== fact.inputPointer) {
      issues.push({ inputPointer: fact.inputPointer, keyword: 'input_scope_mismatch' })
      if (issues.length >= MAX_VALIDATION_ISSUES) break
      continue
    }
    if (seenKeys.has(fact.input) || seenPointers.some((pointer) => pointerCovers(pointer, fact.inputPointer) || pointerCovers(fact.inputPointer, pointer))) {
      issues.push({ inputPointer: fact.inputPointer, keyword: 'input_conflict' })
      if (issues.length >= MAX_VALIDATION_ISSUES) break
      continue
    }
    seenKeys.add(fact.input)
    seenPointers.push(fact.inputPointer)
    const validator = model.inputValidators.get(fact.input)
    if (validator === undefined || !validator(fact.value)) {
      issues.push({ inputPointer: fact.inputPointer, keyword: 'value_invalid' })
      if (issues.length >= MAX_VALIDATION_ISSUES) break
      continue
    }
    accepted.push({ semantic, value: fact.value })
  }
  if (issues.length > 0) return deepFreeze({ kind: 'incompatible', issues }) as CapabilityInputAssessment
  const required = model.inputs.filter((input) => input.required && (
    draft.stage === 'commitment' || input.stage === 'option_selection'
  ))
  const acceptedKeys = new Set(accepted.map(({ semantic }) => semantic.key))
  const missing = required.filter((input) => !acceptedKeys.has(input.key))
  if (missing.length > 0) return deepFreeze({ kind: 'needs_information', missing }) as CapabilityInputAssessment
  let input: JsonValue
  try {
    input = materializeInputFacts(accepted)
  } catch {
    return deepFreeze({ kind: 'incompatible', issues: [{ keyword: 'input_materialization_invalid' }] }) as CapabilityInputAssessment
  }
  if (draft.stage === 'option_selection') {
    return deepFreeze({ kind: 'viable', stage: 'option_selection' }) as CapabilityInputAssessment
  }
  const validation = validateDocument(model.inputValidator, input)
  if (validation.kind === 'invalid') {
    return deepFreeze({
      kind: 'incompatible',
      issues: validation.issues.map((issue) => ({ inputPointer: issue.instancePointer, keyword: issue.keyword })),
    }) as CapabilityInputAssessment
  }
  return deepFreeze({ kind: 'viable', stage: 'commitment', input: validation.value }) as CapabilityInputAssessment
}

function materializeInputFacts(
  facts: readonly Readonly<{ semantic: CapabilityInputSemantic; value: JsonValue }>[],
): JsonValue {
  const root: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>
  for (const fact of facts) setJsonPointer(root, fact.semantic.inputPointer, cloneJsonValue(fact.value))
  return root
}

function setJsonPointer(root: Record<string, JsonValue>, pointer: string, value: JsonValue): void {
  const segments = pointer.slice(1).split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
  let current: Record<string, JsonValue> | JsonValue[] = root
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (segment === undefined || segment.length === 0) throw new Error('json_pointer_invalid')
    const final = index === segments.length - 1
    if (final) {
      if (Array.isArray(current)) {
        if (!/^(?:0|[1-9]\d*)$/.test(segment)) throw new Error('json_pointer_invalid')
        current[Number(segment)] = value
      } else {
        current[segment] = value
      }
      continue
    }
    const nextSegment = segments[index + 1]
    const expectsArray = nextSegment !== undefined && /^(?:0|[1-9]\d*)$/.test(nextSegment)
    const existing = Array.isArray(current)
      ? current[Number(segment)]
      : current[segment]
    let child: Record<string, JsonValue> | JsonValue[]
    if (existing === undefined) {
      child = expectsArray ? [] : Object.create(null) as Record<string, JsonValue>
    } else if (existing !== null && typeof existing === 'object' && Array.isArray(existing) === expectsArray) {
      child = existing as Record<string, JsonValue> | JsonValue[]
    } else {
      throw new Error('json_pointer_conflict')
    }
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/.test(segment)) throw new Error('json_pointer_invalid')
      current[Number(segment)] = child
    } else {
      current[segment] = child
    }
    current = child
  }
}

function validateDocument(validator: SchemaValidator, value: unknown): CapabilityDocumentValidation {
  if (!valueIsBoundedJson(value)) {
    return deepFreeze({
      kind: 'invalid',
      issues: [{ instancePointer: '', keyword: 'value_too_complex' }],
      truncated: false,
    }) as CapabilityDocumentValidation
  }
  if (validator(value)) {
    const validatedValue = deepFreeze(cloneJsonValue(value)) as JsonValue
    return Object.freeze({ kind: 'valid', value: validatedValue }) as CapabilityDocumentValidation
  }
  const errors = validator.errors ?? []
  const issues = errors.slice(0, MAX_VALIDATION_ISSUES).map((error) => ({
    instancePointer: error.instancePath ?? '',
    keyword: error.keyword ?? 'invalid',
  }))
  return deepFreeze({ kind: 'invalid', issues, truncated: errors.length > MAX_VALIDATION_ISSUES }) as CapabilityDocumentValidation
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneJsonValue)
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]))
}

function valueIsBoundedJson(value: unknown): value is JsonValue {
  const active = new Set<object>()
  let nodes = 0
  function visit(candidate: unknown, depth: number): boolean {
    nodes += 1
    if (nodes > MAX_VALIDATED_VALUE_NODES || depth > MAX_VALIDATED_VALUE_DEPTH) return false
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return true
    if (typeof candidate === 'number') return Number.isFinite(candidate)
    if (typeof candidate !== 'object') return false
    if (!Array.isArray(candidate)) {
      const prototype = Object.getPrototypeOf(candidate)
      if (prototype !== Object.prototype && prototype !== null) return false
    }
    if (active.has(candidate)) return false
    active.add(candidate)
    const children = Array.isArray(candidate) ? candidate : Object.values(candidate)
    for (const child of children) if (!visit(child, depth + 1)) return false
    active.delete(candidate)
    return true
  }
  return visit(value, 0)
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

function resolveInstanceSchema(
  root: Readonly<Record<string, JsonValue>>,
  pointer: string,
): Readonly<Record<string, JsonValue>> | undefined {
  const segments = pointer.slice(1).split('/').map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
  return resolveInstanceSchemaSegments(root, segments, root, new Set())
}

function resolvePointedSchema(
  root: Readonly<Record<string, JsonValue>>,
  pointer: string,
): Readonly<Record<string, JsonValue>> | undefined {
  const schema = resolveInstanceSchema(root, pointer)
  return schema === undefined ? undefined : normalizePointedSchema(schema, root, new Set())
}

function normalizePointedSchema(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): Readonly<Record<string, JsonValue>> {
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      const normalizedTarget = normalizePointedSchema(target, root, new Set([...seenReferences, reference]))
      const siblings = normalizeSchemaChildren(schema, root, seenReferences, new Set(['$ref']))
      return Object.keys(siblings).length === 0 ? normalizedTarget : { allOf: [normalizedTarget, siblings] }
    }
  }
  return normalizeSchemaChildren(schema, root, seenReferences, new Set())
}

function normalizeSchemaChildren(
  schema: Readonly<Record<string, JsonValue>>,
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
  omitted: ReadonlySet<string>,
): Readonly<Record<string, JsonValue>> {
  const normalized: Record<string, JsonValue> = {}
  const schemaMaps = new Set(['properties', 'patternProperties', 'dependentSchemas'])
  const schemaValues = new Set(['additionalProperties', 'unevaluatedProperties', 'propertyNames', 'contains', 'contentSchema', 'if', 'then', 'else', 'not', 'items', 'unevaluatedItems'])
  const schemaArrays = new Set(['prefixItems', 'allOf', 'anyOf', 'oneOf'])
  for (const [key, value] of Object.entries(schema)) {
    if (omitted.has(key) || key === '$defs' || key === 'definitions' || key === '$schema' || key === '$id') continue
    if (schemaMaps.has(key) && isJsonRecord(value)) {
      normalized[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [
        name,
        isJsonRecord(child) ? normalizePointedSchema(child, root, seenReferences) : child,
      ]))
    } else if (schemaValues.has(key) && isJsonRecord(value)) {
      normalized[key] = normalizePointedSchema(value, root, seenReferences)
    } else if (schemaArrays.has(key) && Array.isArray(value)) {
      normalized[key] = value.map((child) => isJsonRecord(child) ? normalizePointedSchema(child, root, seenReferences) : child)
    } else {
      normalized[key] = value
    }
  }
  return normalized
}

function resolveInstanceSchemaSegments(
  schema: Readonly<Record<string, JsonValue>>,
  segments: readonly string[],
  root: Readonly<Record<string, JsonValue>>,
  seenReferences: ReadonlySet<string>,
): Readonly<Record<string, JsonValue>> | undefined {
  if (segments.length === 0) return schema
  const reference = schema.$ref
  if (typeof reference === 'string' && reference.startsWith('#/') && !seenReferences.has(reference)) {
    const target = resolveSchemaReference(root, reference)
    if (target !== undefined) {
      const resolved = resolveInstanceSchemaSegments(target, segments, root, new Set([...seenReferences, reference]))
      if (resolved !== undefined) return resolved
    }
  }
  const [head, ...tail] = segments
  const properties = schema.properties
  if (head !== undefined && isJsonRecord(properties) && isJsonRecord(properties[head])) {
    return resolveInstanceSchemaSegments(properties[head], tail, root, seenReferences)
  }
  if (head !== undefined && /^(?:0|[1-9]\d*)$/.test(head)) {
    const index = Number(head)
    const prefixItems = schema.prefixItems
    const itemSchema = Array.isArray(prefixItems) && isJsonRecord(prefixItems[index])
      ? prefixItems[index]
      : isJsonRecord(schema.items) ? schema.items : undefined
    if (itemSchema !== undefined) return resolveInstanceSchemaSegments(itemSchema, tail, root, seenReferences)
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const candidates = schema[keyword]
    if (!Array.isArray(candidates)) continue
    const resolved = candidates
      .filter(isJsonRecord)
      .map((candidate) => resolveInstanceSchemaSegments(candidate, segments, root, seenReferences))
      .filter((candidate): candidate is Readonly<Record<string, JsonValue>> => candidate !== undefined)
    if (resolved.length > 0 && resolved.every((candidate) => canonicalDigest(candidate as StableHashValue) === canonicalDigest(resolved[0] as StableHashValue))) {
      return resolved[0]
    }
  }
  return undefined
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
  if (head !== undefined && /^(?:0|[1-9]\d*)$/.test(head)) {
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
