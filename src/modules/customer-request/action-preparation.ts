import {
  sameCapabilityContractRef,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
  type CapabilityPreparationDataUse,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { CustomerRequestV2Aggregate } from './compiler'

export type ActionPreparationLineage = Readonly<{
  requestId: string
  requestRevision: number
  principalId: string
  delegatedAgentId: string
  planRevisionId: string
  planDigest: string
  actionId: string
  contractRef: CapabilityContractRef
  selectionKey: string
  semanticDigest: string
}>

export type ActionPreparationAuthorityScope = Readonly<{
  declarations: readonly CapabilityPreparationDataUse[]
  authorityScopeDigest: string
}>

export type ActionPreparationDisclosureReview = Readonly<{
  reviewRef: string
  reviewDigest: string
  lineage: ActionPreparationLineage
  categories: readonly Readonly<{
    inputKey: string
    inputPointer: string
    schemaIdentity: string
    label: string
    classification: CapabilityPreparationDataUse['classification']
  }>[]
  purposes: readonly string[]
  recipients: readonly CapabilityPreparationDataUse['recipient'][]
  effectRequirements: readonly CapabilityPreparationDataUse['effect'][]
}>

export type VerifiedActionPreparationAuthority = Readonly<{
  kind: 'clerk_identity' | 'service_assertion'
  principalId: string
  ownerId: string
  credentialId: string
  evidenceRef: string
  verifiedAt: number
}>

export type ActionPreparationAuthorityReservation = Readonly<{
  reservationRef: string
  reservationDigest: string
  authorityReference: string
  principalId: string
  ownerId: string
  credentialId: string
  lineage: ActionPreparationLineage
  authorityScopeDigest: string
  verification: Readonly<{
    kind: VerifiedActionPreparationAuthority['kind']
    evidenceRef: string
    verifiedAt: number
  }>
  reservedAt: number
}>

export type AuthorizedActionPreparation = ActionPreparationBase & Readonly<{
  kind: 'ready_for_routing'
  authorityReservation: ActionPreparationAuthorityReservation
}>

type ActionPreparationBase = Readonly<{
  preparationRef: string
  preparationDigest: string
  lineage: ActionPreparationLineage
  projectedInputDigest?: string
  authorityScope: ActionPreparationAuthorityScope
  disclosureReview: ActionPreparationDisclosureReview
  preparedAt: number
}>

export type DurableActionPreparation =
  | (ActionPreparationBase & Readonly<{
    kind: 'needs_information'
    missing: readonly Readonly<{
      inputKey: string
      inputPointer: string
      schemaIdentity: string
      label: string
    }>[]
  }>)
  | (ActionPreparationBase & Readonly<{ kind: 'needs_authority' }>)
  | (ActionPreparationBase & Readonly<{
    kind: 'ready_for_routing'
    authorityReservation?: ActionPreparationAuthorityReservation
  }>)

export type ProjectActionPreparationResult = DurableActionPreparation
  | Readonly<{ kind: 'stale'; reason: 'capability_authority_changed' }>
  | Readonly<{ kind: 'refused'; reason: 'action_not_found' | 'preparation_incompatible' }>

export function projectActionPreparation(input: Readonly<{
  aggregate: CustomerRequestV2Aggregate
  actionId: string
  model: CapabilityDecisionModel
  now: number
}>): ProjectActionPreparationResult {
  const action = input.aggregate.plan.actions.find((candidate) => candidate.actionId === input.actionId)
  if (action === undefined) return { kind: 'refused', reason: 'action_not_found' }
  if (!sameCapabilityContractRef(action.contractRef, input.model.contractRef)
    || action.selectionKey !== input.model.selectionKey
    || action.semanticDigest !== input.model.semanticDigest) {
    return { kind: 'stale', reason: 'capability_authority_changed' }
  }
  const projection = input.model.projectPreparation({
    contractRef: action.contractRef,
    selectionKey: action.selectionKey,
    semanticDigest: action.semanticDigest,
    facts: action.inputs.map((fact) => ({
      input: fact.inputKey,
      inputPointer: fact.inputPointer,
      value: fact.value,
    })),
  })
  if (projection.kind === 'incompatible') return { kind: 'refused', reason: 'preparation_incompatible' }
  const lineage: ActionPreparationLineage = freeze({
    requestId: input.aggregate.snapshot.requestId,
    requestRevision: input.aggregate.snapshot.revision,
    principalId: input.aggregate.snapshot.principalId,
    delegatedAgentId: input.aggregate.snapshot.delegatedAgentId,
    planRevisionId: input.aggregate.plan.planRevisionId,
    planDigest: input.aggregate.plan.planDigest,
    actionId: action.actionId,
    contractRef: freeze({ ...action.contractRef }),
    selectionKey: action.selectionKey,
    semanticDigest: action.semanticDigest,
  })
  const authorityScope = actionPreparationAuthorityScope(projection.dataUse)
  const disclosureReview = actionPreparationDisclosureReview(lineage, authorityScope)
  const preparationRef = `action-preparation:${canonicalDigest({ lineage } as StableHashValue)}`
  const baseMaterial = {
    preparationRef,
    lineage,
    ...(projection.kind === 'ready' ? { projectedInputDigest: canonicalDigest(projection.input as StableHashValue) } : {}),
    authorityScope,
    disclosureReview,
    preparedAt: input.now,
  }
  const statusMaterial = projection.kind === 'needs_information'
    ? {
        kind: 'needs_information' as const,
        missing: projection.missing.map(({ key, inputPointer, schemaIdentity, label }) => ({
          inputKey: key, inputPointer, schemaIdentity, label,
        })),
      }
    : authorityScope.declarations.some((declaration) => declaration.effect.authority !== 'none')
      ? { kind: 'needs_authority' as const }
      : { kind: 'ready_for_routing' as const }
  return freeze({
    ...baseMaterial,
    ...statusMaterial,
    preparationDigest: canonicalDigest({ ...baseMaterial, ...statusMaterial } as StableHashValue),
  }) as DurableActionPreparation
}

export function authorizeActionPreparation(input: Readonly<{
  preparation: Extract<DurableActionPreparation, { kind: 'needs_authority' }>
  authorityReference: string
  authority: VerifiedActionPreparationAuthority
}>): AuthorizedActionPreparation {
  if (input.authorityReference !== input.preparation.preparationRef) {
    throw new Error('action_preparation_authority_reference_mismatch')
  }
  if (input.authority.principalId !== input.preparation.lineage.principalId) {
    throw new Error('action_preparation_authority_principal_mismatch')
  }
  if (!valid(input.authority.ownerId) || !valid(input.authority.credentialId)
    || !valid(input.authority.evidenceRef) || !Number.isSafeInteger(input.authority.verifiedAt)) {
    throw new Error('action_preparation_authority_invalid')
  }
  const reservationMaterial = {
    authorityReference: input.authorityReference,
    principalId: input.authority.principalId,
    ownerId: input.authority.ownerId,
    credentialId: input.authority.credentialId,
    lineage: input.preparation.lineage,
    authorityScopeDigest: input.preparation.authorityScope.authorityScopeDigest,
    verification: {
      kind: input.authority.kind,
      evidenceRef: input.authority.evidenceRef,
      verifiedAt: input.authority.verifiedAt,
    },
    reservedAt: input.authority.verifiedAt,
  }
  const reservationDigest = canonicalDigest(reservationMaterial as StableHashValue)
  const authorityReservation = freeze({
    reservationRef: `action-authority-reservation:${reservationDigest}`,
    reservationDigest,
    ...reservationMaterial,
  })
  const { kind: _kind, preparationDigest: _preparationDigest, ...base } = input.preparation
  const readyMaterial = { ...base, kind: 'ready_for_routing' as const, authorityReservation }
  return freeze({
    ...readyMaterial,
    preparationDigest: canonicalDigest(readyMaterial as StableHashValue),
  })
}

function actionPreparationAuthorityScope(
  declarations: readonly CapabilityPreparationDataUse[],
): ActionPreparationAuthorityScope {
  const normalized = declarations.map((declaration) => ({
    ...declaration,
    purposes: [...declaration.purposes].sort(),
    recipient: { ...declaration.recipient },
    effect: { ...declaration.effect },
    inputs: declaration.inputs.map((item) => ({ ...item }))
      .sort((left, right) => left.inputPointer.localeCompare(right.inputPointer)),
  })).sort((left, right) => String(left.declarationKey).localeCompare(String(right.declarationKey)))
  return freeze({
    declarations: normalized,
    authorityScopeDigest: canonicalDigest(normalized as StableHashValue),
  })
}

function actionPreparationDisclosureReview(
  lineage: ActionPreparationLineage,
  authorityScope: ActionPreparationAuthorityScope,
): ActionPreparationDisclosureReview {
  const categories = new Map<string, ActionPreparationDisclosureReview['categories'][number]>()
  const purposes = new Set<string>()
  const recipients = new Map<string, CapabilityPreparationDataUse['recipient']>()
  const effects = new Map<string, CapabilityPreparationDataUse['effect']>()
  for (const declaration of authorityScope.declarations) {
    for (const item of declaration.inputs) categories.set(`${item.inputKey}\u0000${item.inputPointer}`, {
      inputKey: item.inputKey,
      inputPointer: item.inputPointer,
      schemaIdentity: item.schemaIdentity,
      label: item.label,
      classification: declaration.classification,
    })
    declaration.purposes.forEach((purpose) => purposes.add(purpose))
    recipients.set(canonicalDigest(declaration.recipient as StableHashValue), declaration.recipient)
    effects.set(declaration.effect.effectId, declaration.effect)
  }
  const reviewMaterial = {
    lineage,
    categories: [...categories.values()].sort((left, right) => left.inputPointer.localeCompare(right.inputPointer)),
    purposes: [...purposes].sort(),
    recipients: [...recipients.values()],
    effectRequirements: [...effects.values()].sort((left, right) => left.effectId.localeCompare(right.effectId)),
  }
  const reviewDigest = canonicalDigest(reviewMaterial as StableHashValue)
  return freeze({
    reviewRef: `action-preparation-review:${reviewDigest}`,
    reviewDigest,
    ...reviewMaterial,
  })
}

function valid(value: string): boolean {
  return value.trim().length > 0 && value.length <= 300
}

function freeze<Value>(value: Value): Value {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child)
    Object.freeze(value)
  }
  return value
}
