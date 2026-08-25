import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { identifier, jsonSchema, jsonValueSchema, type JsonValue } from './json-value'
import {
  assertSchemaIsSafeAndValid,
  declaredTopLevelProperties,
  escapePointerSegment,
  inputSchemaSupportsStageProjection,
  instancePointerExists,
  instancePointerStatus,
  pointerCovers,
  pointerSyntaxIsCanonical,
  requiredInputPointers,
  resolvePointedSchema,
  schemaCompilesIndependently,
  schemaIsClosedObject,
} from './pointed-schema'

export const CAPABILITY_CONTRACT_FORMAT = 'ae.capability-contract:v2' as const
const MAX_CONTRACT_JSON_BYTES = 300_000
const contractJsonEncoder = new TextEncoder()
const definedContracts = new WeakSet<object>()

const customerAnnotation = z.strictObject({
  annotationId: identifier,
  semanticIdentity: identifier.optional(),
  document: z.enum(['input', 'output']),
  pointer: z.string().max(500).refine(pointerSyntaxIsCanonical),
  label: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(240).optional(),
  role: z.enum(['request', 'constraint', 'comparison', 'commitment', 'result', 'completion_evidence', 'recovery']),
  inference: z.enum(['allowed', 'customer_required']).optional(),
})
const dataUse = z.strictObject({
  effectId: identifier,
  inputPointer: z.string().startsWith('/').max(500).refine(pointerSyntaxIsCanonical),
  classification: z.enum(['public', 'personal', 'sensitive', 'credential']),
  phase: z.enum(['preparation', 'execution']),
  recipient: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('candidate_binding') }),
    z.strictObject({ kind: z.literal('selected_binding') }),
    z.strictObject({ kind: z.literal('named_recipient'), recipientId: identifier }),
  ]),
  purposes: z.array(identifier).min(1).max(16),
})
const effect = z.strictObject({
  effectId: identifier,
  class: z.enum(['data_release', 'financial_exposure', 'external_state_change']),
  authority: z.enum(['none', 'explicit', 'mandate_or_explicit']),
  reversibility: z.enum(['not_applicable', 'reversible', 'conditional', 'irreversible']),
})
const evidence = z.strictObject({
  evidenceId: identifier,
  outputPointer: z.string().max(500).refine(pointerSyntaxIsCanonical),
  purpose: z.enum(['comparison', 'completion', 'recovery']),
})
const lifecycle = z.strictObject({
  idempotency: z.enum(['not_applicable', 'required']),
  recovery: z.enum(['retry_safe', 'reconcile_required']),
})
/**
 * Mirrors the Vercel AI SDK `inputExamples` shape ("an array of input examples that
 * helps guide the model on how input data should be structured when the JSON schema
 * does not fully specify intended usage"): each example is `{ label?, input }` where
 * `input` is an object conforming to the capability's input schema.
 * Advisory teaching data only; full schema conformance is asserted at plan-inspection
 * time rather than at registration so a partial illustrative example is not rejected.
 */
const inputExample = z.strictObject({
  label: z.string().trim().min(1).max(160).optional(),
  input: z.record(z.string(), jsonValueSchema),
})
const contractDocumentSchema = z.strictObject({
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
  inputExamples: z.array(inputExample).max(32).optional(),
})

export type CapabilityInputExample = Readonly<{
  label?: string | undefined
  input: Readonly<Record<string, JsonValue>>
}>
export type CapabilityContractDocument = Readonly<z.infer<typeof contractDocumentSchema>>
export type CapabilityContractRef = Readonly<{
  capabilityId: string
  version: number
  contractDigest: string
}>
export type CapabilityContract = CapabilityContractDocument & Readonly<{ ref: CapabilityContractRef }>

export function isDefinedCapabilityContract(contract: object): boolean {
  return definedContracts.has(contract)
}

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
  const inputAnnotationPointers = new Set<string>()
  for (const annotation of document.customerAnnotations) {
    if (annotation.document === 'input') inputAnnotationPointers.add(annotation.pointer)
  }
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
  if (document.customerAnnotations.some((annotation) => (
    annotation.document === 'output' && annotation.inference !== undefined
  ))) throw new Error('capability_output_inference_policy_invalid')
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

export function parseCapabilityContractJson(input: string): CapabilityContract {
  if (contractJsonEncoder.encode(input).byteLength > MAX_CONTRACT_JSON_BYTES) {
    throw new Error('capability_contract_too_large')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    throw new Error('capability_contract_invalid')
  }
  return defineCapabilityContract(parsed)
}

export function sameCapabilityContractRef(left: CapabilityContractRef, right: CapabilityContractRef): boolean {
  return left.capabilityId === right.capabilityId
    && left.version === right.version
    && left.contractDigest === right.contractDigest
}

function assertUniqueSemanticIds(document: CapabilityContractDocument): void {
  for (const ids of [
    document.customerAnnotations.map((annotation) => annotation.annotationId),
    document.effects.map((declaredEffect) => declaredEffect.effectId),
    document.evidence.map((requirement) => requirement.evidenceId),
  ]) {
    if (new Set(ids).size !== ids.length) throw new Error('capability_semantic_id_duplicate')
  }
  const dataUseIdentities = document.dataUse.map((declaration) => canonicalDigest(declaration as StableHashValue))
  if (new Set(dataUseIdentities).size !== dataUseIdentities.length) {
    throw new Error('capability_data_use_duplicate')
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
  const inputPointers: string[] = []
  for (const annotation of document.customerAnnotations) {
    if (annotation.document === 'input') inputPointers.push(annotation.pointer)
  }
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

function assertLifecycleIsConsistent(value: CapabilityContractDocument['lifecycle']): void {
  const retryHasIdempotency = value.recovery !== 'retry_safe' || value.idempotency === 'required'
  if (!retryHasIdempotency) throw new Error('capability_lifecycle_inconsistent')
}
