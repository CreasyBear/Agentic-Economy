import {
  sameCapabilityContractRef,
  isBoundedJsonValue,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

type ActionPreparationDataUse = Readonly<{
  declarationKey: string
  effectId: string
  inputPointer: string
  schemaIdentity: string
  classification: 'public' | 'personal' | 'sensitive' | 'credential'
  phase: 'preparation' | 'execution'
  recipient: Readonly<{ kind: 'candidate_binding' | 'selected_binding' } | { kind: 'named_recipient'; recipientId: string }>
  purposes: readonly string[]
  effect: Readonly<{
    effectId: string
    class: 'data_release' | 'financial_exposure' | 'external_state_change'
    authority: 'none' | 'explicit' | 'mandate_or_explicit'
    reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'
  }>
  inputs: readonly Readonly<{
    inputKey: string
    inputPointer: string
    label: string
    schemaIdentity: string
  }>[]
}>

type ActionPreparationAggregate = Readonly<{
  snapshot: Readonly<{
    requestId: string
    revision: number
    principalId: string
    delegatedAgentId: string
  }>
  plan: Readonly<{
    planRevisionId: string
    planDigest: string
    actions: readonly Readonly<{
      actionId: string
      contractRef: CapabilityContractRef
      selectionKey: string
      semanticDigest: string
      inputs: readonly Readonly<{
        inputKey: string
        inputPointer: string
        schemaIdentity: string
        value: unknown
      }>[]
    }>[]
  }>
}>

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
  declarations: readonly ActionPreparationDataUse[]
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
    classification: ActionPreparationDataUse['classification']
  }>[]
  purposes: readonly string[]
  recipients: readonly ActionPreparationDataUse['recipient'][]
  effectRequirements: readonly ActionPreparationDataUse['effect'][]
}>

export type VerifiedActionPreparationApprovalActor = Readonly<{
  kind: 'clerk_owner'
  requestPrincipalId: string
  ownerId: string
  credentialId: string
  authenticationEvidenceRef: string
  approvedAt: number
}>

export type ActionPreparationApprovalEvidence = Readonly<{
  approvalRef: string
  approvalDigest: string
  preparationRef: string
  reviewRef: string
  reviewDigest: string
  authorityScopeDigest: string
  principalId: string
  ownerId: string
  credentialId: string
  lineage: ActionPreparationLineage
  commandDigest: string
  verification: Readonly<{
    kind: VerifiedActionPreparationApprovalActor['kind']
    authenticationEvidenceRef: string
  }>
  approvedAt: number
}>

export type ActionPreparationAuthorityReservation = Readonly<{
  reservationRef: string
  reservationDigest: string
  authorityReference: string
  approvalDigest: string
  reviewDigest: string
  principalId: string
  ownerId: string
  credentialId: string
  lineage: ActionPreparationLineage
  authorityScopeDigest: string
  verification: Readonly<{
    kind: VerifiedActionPreparationApprovalActor['kind']
    authenticationEvidenceRef: string
    approvedAt: number
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
  aggregate: ActionPreparationAggregate
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
  const facts = action.inputs.map((fact) => {
    const semantic = input.model.inputs.find((candidate) => candidate.key === fact.inputKey
      && candidate.inputPointer === fact.inputPointer && candidate.schemaIdentity === fact.schemaIdentity)
    return semantic === undefined || !isBoundedJsonValue(fact.value)
      ? undefined
      : { input: semantic.key, inputPointer: semantic.inputPointer, value: fact.value }
  })
  if (facts.some((fact) => fact === undefined)) return { kind: 'refused', reason: 'preparation_incompatible' }
  const projection = input.model.projectPreparation({
    contractRef: action.contractRef,
    selectionKey: input.model.selectionKey,
    semanticDigest: action.semanticDigest,
    facts: facts.flatMap((fact) => fact === undefined ? [] : [fact]),
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
  preparationRef: string
  commandDigest: string
  actor: VerifiedActionPreparationApprovalActor
}>): Readonly<{ preparation: AuthorizedActionPreparation; approval: ActionPreparationApprovalEvidence }> {
  if (input.preparationRef !== input.preparation.preparationRef) {
    throw new Error('action_preparation_reference_mismatch')
  }
  if (input.actor.requestPrincipalId !== input.preparation.lineage.principalId) {
    throw new Error('action_preparation_approval_principal_mismatch')
  }
  if (!valid(input.actor.ownerId) || !valid(input.actor.credentialId)
    || !valid(input.actor.authenticationEvidenceRef) || !valid(input.commandDigest)
    || !Number.isSafeInteger(input.actor.approvedAt)) {
    throw new Error('action_preparation_approval_invalid')
  }
  const approvalMaterial = {
    preparationRef: input.preparation.preparationRef,
    reviewRef: input.preparation.disclosureReview.reviewRef,
    reviewDigest: input.preparation.disclosureReview.reviewDigest,
    authorityScopeDigest: input.preparation.authorityScope.authorityScopeDigest,
    principalId: input.preparation.lineage.principalId,
    ownerId: input.actor.ownerId,
    credentialId: input.actor.credentialId,
    lineage: input.preparation.lineage,
    commandDigest: input.commandDigest,
    verification: {
      kind: input.actor.kind,
      authenticationEvidenceRef: input.actor.authenticationEvidenceRef,
    },
    approvedAt: input.actor.approvedAt,
  }
  const approvalDigest = canonicalDigest(approvalMaterial as StableHashValue)
  const approval = freeze({
    approvalRef: `action-preparation-approval:${approvalDigest}`,
    approvalDigest,
    ...approvalMaterial,
  })
  const reservationMaterial = {
    authorityReference: approval.approvalRef,
    approvalDigest: approval.approvalDigest,
    reviewDigest: approval.reviewDigest,
    principalId: approval.principalId,
    ownerId: approval.ownerId,
    credentialId: approval.credentialId,
    lineage: input.preparation.lineage,
    authorityScopeDigest: input.preparation.authorityScope.authorityScopeDigest,
    verification: { ...approval.verification, approvedAt: approval.approvedAt },
    reservedAt: approval.approvedAt,
  }
  const reservationDigest = canonicalDigest(reservationMaterial as StableHashValue)
  const authorityReservation = freeze({
    reservationRef: `action-authority-reservation:${reservationDigest}`,
    reservationDigest,
    ...reservationMaterial,
  })
  const { kind: _kind, preparationDigest: _preparationDigest, ...base } = input.preparation
  const readyMaterial = { ...base, kind: 'ready_for_routing' as const, authorityReservation }
  const preparation = freeze({
    ...readyMaterial,
    preparationDigest: canonicalDigest(readyMaterial as StableHashValue),
  })
  return freeze({ preparation, approval })
}

function actionPreparationAuthorityScope(
  declarations: readonly ActionPreparationDataUse[],
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
  const recipients = new Map<string, ActionPreparationDataUse['recipient']>()
  const effects = new Map<string, ActionPreparationDataUse['effect']>()
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
