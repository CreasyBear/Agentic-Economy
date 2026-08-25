import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  defineCapabilityContract,
  isDefinedCapabilityContract,
  sameCapabilityContractRef,
  type CapabilityContract,
  type CapabilityContractDocument,
  type CapabilityContractRef,
} from './define-contract'
import { isBoundedJsonValue, type JsonValue } from './json-value'
import {
  compiledPointedValidator,
  compiledValidator,
  decodeJsonPointerSegments,
  instancePointerStatus,
  pointerCovers,
  pointersOverlap,
  rehydratePointedSchemaIdentity,
  resolvePointedSchema,
  type PointedSchemaIdentity,
  type SchemaValidator,
} from './pointed-schema'

const MAX_VALIDATION_ISSUES = 32
const MAX_INPUT_FACTS = 128

declare const capabilitySelectionKeyBrand: unique symbol
declare const capabilityInputKeyBrand: unique symbol
declare const capabilityDataUseDeclarationKeyBrand: unique symbol

export type CapabilitySelectionKey = string & Readonly<{ [capabilitySelectionKeyBrand]: true }>
export type CapabilityInputKey = string & Readonly<{ [capabilityInputKeyBrand]: true }>
export type CapabilityDataUseDeclarationKey = string & Readonly<{ [capabilityDataUseDeclarationKeyBrand]: true }>

export function rehydrateCapabilitySelectionKey(value: string): CapabilitySelectionKey {
  if (value.trim().length === 0) throw new Error('capability_selection_key_invalid')
  return value as CapabilitySelectionKey
}

export function rehydrateCapabilityInputKey(value: string): CapabilityInputKey {
  if (value.trim().length === 0) throw new Error('capability_input_key_invalid')
  return value as CapabilityInputKey
}

export type CapabilityInputStage = 'option_selection' | 'commitment'
export type CapabilityInputSemantic = Readonly<{
  key: CapabilityInputKey
  annotationId: string
  semanticIdentity?: string
  inputPointer: string
  label: string
  prompt?: string
  role: 'request' | 'constraint' | 'comparison' | 'commitment'
  inference: 'allowed' | 'customer_required'
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
  semanticIdentity?: string
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
export type CapabilityPreparationDataUse = Readonly<{
  declarationKey: CapabilityDataUseDeclarationKey
  effectId: string
  inputPointer: string
  schemaIdentity: PointedSchemaIdentity
  classification: CapabilityContractDocument['dataUse'][number]['classification']
  phase: CapabilityContractDocument['dataUse'][number]['phase']
  recipient: CapabilityContractDocument['dataUse'][number]['recipient']
  purposes: CapabilityContractDocument['dataUse'][number]['purposes']
  effect: CapabilityContractDocument['effects'][number]
  inputs: readonly Readonly<{
    inputKey: CapabilityInputKey
    inputPointer: string
    label: string
    schemaIdentity: PointedSchemaIdentity
  }>[]
}>
export type CapabilityPreparationDraft = Readonly<{
  contractRef: CapabilityContractRef
  selectionKey: CapabilitySelectionKey
  semanticDigest: string
  facts: readonly CapabilityInputFact[]
}>
type CapabilityPreparationAuthority = Readonly<{
  contractRef: CapabilityContractRef
  selectionKey: CapabilitySelectionKey
  semanticDigest: string
}>
export type CapabilityPreparationProjection =
  | (CapabilityPreparationAuthority & Readonly<{
    kind: 'ready'
    input: JsonValue
    dataUse: readonly CapabilityPreparationDataUse[]
  }>)
  | (CapabilityPreparationAuthority & Readonly<{
    kind: 'needs_information'
    missing: readonly CapabilityInputSemantic[]
    dataUse: readonly CapabilityPreparationDataUse[]
  }>)
  | (CapabilityPreparationAuthority & Readonly<{
    kind: 'incompatible'
    issues: readonly Readonly<{ inputPointer?: string; keyword: string }>[]
  }>)
export type CapabilityDecisionModel = Readonly<{
  contractRef: CapabilityContractRef
  selectionKey: CapabilitySelectionKey
  semanticDigest: string
  inputs: readonly CapabilityInputSemantic[]
  evidence: readonly CapabilityEvidenceSemantic[]
  dataUse: CapabilityContractDocument['dataUse']
  effects: CapabilityContractDocument['effects']
  lifecycle: CapabilityContractDocument['lifecycle']
  assessInput: (draft: Readonly<{
    contractRef: CapabilityContractRef
    selectionKey: CapabilitySelectionKey
    stage: CapabilityInputStage
    facts: readonly CapabilityInputFact[]
  }>) => CapabilityInputAssessment
  projectPreparation: (draft: CapabilityPreparationDraft) => CapabilityPreparationProjection
  validateInput: (value: unknown) => CapabilityDocumentValidation
  validateOutput: (value: unknown) => CapabilityDocumentValidation
}>

export function projectCapabilityInputValueSchema(
  inputSchema: CapabilityContractDocument['inputSchema'],
  input: CapabilityInputSemantic,
): Readonly<Record<string, JsonValue>> {
  const pointedSchema = resolvePointedSchema(inputSchema, input.inputPointer)
  const pointedSchemaIdentity = pointedSchema === undefined
    ? undefined
    : rehydratePointedSchemaIdentity(canonicalDigest(pointedSchema as StableHashValue))
  if (pointedSchema === undefined || pointedSchemaIdentity !== input.schemaIdentity) {
    throw new Error('capability_input_schema_projection_mismatch')
  }
  return pointedSchema
}

export function projectCapabilityInputValueSchemas(
  inputSchema: CapabilityContractDocument['inputSchema'],
  inputs: readonly CapabilityInputSemantic[],
  maximumBytes: number,
): readonly Readonly<{
  inputKey: CapabilityInputKey
  valueSchema: Readonly<Record<string, JsonValue>>
}>[] {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error('capability_input_schema_projection_limit_invalid')
  }
  let projectedBytes = 0
  const projections = []
  for (const input of inputs) {
    const projection = Object.freeze({
      inputKey: input.key,
      valueSchema: projectCapabilityInputValueSchema(inputSchema, input),
    })
    projectedBytes += new TextEncoder().encode(JSON.stringify(projection)).byteLength
    if (projectedBytes > maximumBytes) throw new Error('capability_input_schema_projection_too_large')
    projections.push(projection)
  }
  return Object.freeze(projections)
}

export function openCapabilityDecisionModel(contract: CapabilityContract): CapabilityDecisionModel {
  let exactContract = contract
  if (!isDefinedCapabilityContract(contract)) {
    const { ref: suppliedRef, ...suppliedDocument } = contract
    const verifiedContract = defineCapabilityContract(suppliedDocument)
    if (!sameCapabilityContractRef(suppliedRef, verifiedContract.ref)) {
      throw new Error('capability_contract_ref_mismatch')
    }
    exactContract = verifiedContract
  }
  const selectionKey = rehydrateCapabilitySelectionKey(`ae_selection:${canonicalDigest(exactContract.ref as StableHashValue)}`)
  const inputAnnotations = exactContract.customerAnnotations
    .filter((annotation) => annotation.document === 'input')
    .sort((left, right) => left.pointer.localeCompare(right.pointer))
  const inputs = inputAnnotations.map((annotation): CapabilityInputSemantic => {
    const pointedSchema = resolvePointedSchema(exactContract.inputSchema, annotation.pointer)
    if (pointedSchema === undefined) throw new Error('capability_semantic_projection_failed')
    return {
      key: rehydrateCapabilityInputKey(`ae_input:${canonicalDigest({ ref: exactContract.ref, inputPointer: annotation.pointer } as StableHashValue)}`),
      annotationId: annotation.annotationId,
      ...(annotation.semanticIdentity === undefined ? {} : { semanticIdentity: annotation.semanticIdentity }),
      inputPointer: annotation.pointer,
      label: annotation.label,
      ...(annotation.prompt === undefined ? {} : { prompt: annotation.prompt }),
      role: annotation.role as CapabilityInputSemantic['role'],
      inference: annotation.inference ?? 'allowed',
      stage: annotation.role === 'commitment' ? 'commitment' : 'option_selection',
      required: instancePointerStatus(exactContract.inputSchema, annotation.pointer).guaranteed,
      schemaIdentity: rehydratePointedSchemaIdentity(canonicalDigest(pointedSchema as StableHashValue)),
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
      ...(annotation.semanticIdentity === undefined ? {} : { semanticIdentity: annotation.semanticIdentity }),
      label: annotation.label,
      role: annotation.role as CapabilityEvidenceSemantic['role'],
      guaranteed: instancePointerStatus(exactContract.outputSchema, requirement.outputPointer).guaranteed,
      schemaIdentity: rehydratePointedSchemaIdentity(canonicalDigest(pointedSchema as StableHashValue)),
    }
  }).sort((left, right) => left.outputPointer.localeCompare(right.outputPointer))
  const inputValidator = compiledValidator(exactContract, 'input')
  const outputValidator = compiledValidator(exactContract, 'output')
  const inputValidators = new Map(inputs.map((input) => {
    const schema = resolvePointedSchema(exactContract.inputSchema, input.inputPointer)
    if (schema === undefined) throw new Error('capability_semantic_projection_failed')
    return [input.key, compiledPointedValidator(input.schemaIdentity, schema)]
  }))
  const preparationDataUse = exactContract.dataUse.map((declaration) => {
    const schema = resolvePointedSchema(exactContract.inputSchema, declaration.inputPointer)
    const linkedEffect = exactContract.effects.find((declaredEffect) => declaredEffect.effectId === declaration.effectId)
    if (schema === undefined || linkedEffect === undefined) throw new Error('capability_semantic_projection_failed')
    const overlappingInputs: Array<CapabilityPreparationDataUse['inputs'][number]> = []
    for (const input of inputs) {
      if (!pointersOverlap(declaration.inputPointer, input.inputPointer)) continue
      overlappingInputs.push({
        inputKey: input.key,
        inputPointer: input.inputPointer,
        label: input.label,
        schemaIdentity: input.schemaIdentity,
      })
    }
    const projection: CapabilityPreparationDataUse = {
      declarationKey: `ae_data_use:${canonicalDigest({
        contractRef: exactContract.ref,
        declaration,
      } as StableHashValue)}` as CapabilityDataUseDeclarationKey,
      effectId: declaration.effectId,
      inputPointer: declaration.inputPointer,
      schemaIdentity: rehydratePointedSchemaIdentity(canonicalDigest(schema as StableHashValue)),
      classification: declaration.classification,
      phase: declaration.phase,
      recipient: declaration.recipient,
      purposes: declaration.purposes,
      effect: linkedEffect,
      inputs: overlappingInputs,
    }
    return {
      projection,
      coveredInputs: projection.inputs.map((input) => input.inputKey),
    }
  }).sort((left, right) => (
    left.projection.inputPointer.localeCompare(right.projection.inputPointer)
      || left.projection.effectId.localeCompare(right.projection.effectId)
  ))
  const digestInputs = inputs.map(({ inference, ...input }) => (
    inference === 'allowed' ? input : { ...input, inference }
  ))
  const semanticDigest = canonicalDigest({ contractRef: contract.ref, inputs: digestInputs, evidence } as StableHashValue)
  const model: CapabilityDecisionModel = {
    contractRef: exactContract.ref,
    selectionKey,
    semanticDigest,
    inputs,
    evidence,
    dataUse: exactContract.dataUse,
    effects: exactContract.effects,
    lifecycle: exactContract.lifecycle,
    assessInput: (draft) => assessCapabilityInput({
      contractRef: exactContract.ref,
      selectionKey,
      inputs,
      inputValidators,
      inputValidator,
    }, draft),
    projectPreparation: (draft) => projectCapabilityPreparation({
      contractRef: exactContract.ref,
      selectionKey,
      semanticDigest,
      inputs,
      inputValidators,
      inputValidator,
      dataUse: preparationDataUse,
    }, draft),
    validateInput: (value) => validateDocument(inputValidator, value),
    validateOutput: (value) => validateDocument(outputValidator, value),
  }
  return deepFreeze(model)
}

function projectCapabilityPreparation(
  model: Readonly<{
    contractRef: CapabilityContractRef
    selectionKey: CapabilitySelectionKey
    semanticDigest: string
    inputs: readonly CapabilityInputSemantic[]
    inputValidators: ReadonlyMap<CapabilityInputKey, SchemaValidator>
    inputValidator: SchemaValidator
    dataUse: readonly Readonly<{
      projection: CapabilityPreparationDataUse
      coveredInputs: readonly CapabilityInputKey[]
    }>[]
  }>,
  draft: CapabilityPreparationDraft,
): CapabilityPreparationProjection {
  const authority: CapabilityPreparationAuthority = {
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    semanticDigest: model.semanticDigest,
  }
  if (draft.semanticDigest !== model.semanticDigest) {
    return deepFreeze({
      kind: 'incompatible',
      ...authority,
      issues: [{ keyword: 'semantic_digest_mismatch' }],
    }) as CapabilityPreparationProjection
  }
  const assessment = assessCapabilityInput(model, {
    contractRef: draft.contractRef,
    selectionKey: draft.selectionKey,
    stage: 'commitment',
    facts: draft.facts,
  })
  if (assessment.kind === 'needs_information') {
    const relevantInputs = new Set([
      ...draft.facts.map((fact) => fact.input),
      ...assessment.missing.map((input) => input.key),
    ])
    return deepFreeze({
      kind: 'needs_information',
      ...authority,
      missing: assessment.missing,
      dataUse: applicablePreparationDataUse(model.dataUse, relevantInputs),
    }) as CapabilityPreparationProjection
  }
  if (assessment.kind === 'incompatible') {
    return deepFreeze({ kind: 'incompatible', ...authority, issues: assessment.issues }) as CapabilityPreparationProjection
  }
  if (assessment.stage !== 'commitment') throw new Error('capability_preparation_projection_invalid')
  const suppliedInputs = new Set(draft.facts.map((fact) => fact.input))
  return deepFreeze({
    kind: 'ready',
    ...authority,
    input: assessment.input,
    dataUse: applicablePreparationDataUse(model.dataUse, suppliedInputs),
  }) as CapabilityPreparationProjection
}

function applicablePreparationDataUse(
  declarations: readonly Readonly<{
    projection: CapabilityPreparationDataUse
    coveredInputs: readonly CapabilityInputKey[]
  }>[],
  inputs: ReadonlySet<CapabilityInputKey>,
): readonly CapabilityPreparationDataUse[] {
  const applicable: CapabilityPreparationDataUse[] = []
  for (const declaration of declarations) {
    if (!declaration.coveredInputs.some((input) => inputs.has(input))) continue
    applicable.push({
      ...declaration.projection,
      inputs: declaration.projection.inputs.filter((input) => inputs.has(input.inputKey)),
    })
  }
  return applicable
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
    if (!isBoundedJsonValue(fact.value)) {
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
  for (const fact of facts) setJsonPointer(root, fact.semantic.inputPointer, structuredClone(fact.value))
  return root
}

function setJsonPointer(root: Record<string, JsonValue>, pointer: string, value: JsonValue): void {
  const segments = decodeJsonPointerSegments(pointer)
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
  if (!isBoundedJsonValue(value)) {
    return deepFreeze({
      kind: 'invalid',
      issues: [{ instancePointer: '', keyword: 'value_too_complex' }],
      truncated: false,
    }) as CapabilityDocumentValidation
  }
  if (validator(value)) {
    const validatedValue = deepFreeze(structuredClone(value))
    return Object.freeze({ kind: 'valid', value: validatedValue }) as CapabilityDocumentValidation
  }
  const errors = validator.errors ?? []
  const issues = errors.slice(0, MAX_VALIDATION_ISSUES).map((error) => ({
    instancePointer: error.instancePath ?? '',
    keyword: error.keyword ?? 'invalid',
  }))
  return deepFreeze({ kind: 'invalid', issues, truncated: errors.length > MAX_VALIDATION_ISSUES }) as CapabilityDocumentValidation
}
