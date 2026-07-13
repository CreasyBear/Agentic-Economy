import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { approvalGrantV2Digest, type ApprovalGrantV2 } from './approval-grant-v2'

type AttemptLink = Readonly<{ actionAttemptRef: string; actionAttemptDigest: string }>
type AuthorityLink = Readonly<{
  approvalGrantRef: string
  approvalGrantDigest: string
  authorityLineageDigest: string
}>

export type ActionAttemptV2 = Readonly<{
  format: 'ae.action-attempt:v2'
  actionAttemptRef: string
  actionAttemptDigest: string
  state: 'admitted'
  approvalGrantRef: string
  approvalGrantDigest: string
  authority: ApprovalGrantV2
  authorityLineageDigest: string
  authorityBudgetRef: string
  admissionKeyDigest: string
  lineage: ApprovalGrantV2['lineage']
  maximumSpend: Readonly<{ currency: string; amountMinor: number }>
  recovery: Readonly<{ unknownOutcome: 'reconcile_only'; automaticRetry: false }>
  idempotencyClaimRef: string
  spendReservationRef: string
  dataReservationRef: string
  providerReleaseGrantRef: string
  disclosureGrantRef: string
  admittedAt: number
  expiresAt: number
}>

export type ActionAuthorityBudgetV2 = Readonly<AuthorityLink & {
  format: 'ae.action-authority-budget:v2'
  authorityBudgetRef: string
  authorityBudgetDigest: string
  state: 'available' | 'exhausted'
  currency: string
  maximumSpendMinor: number
  reservedSpendMinor: number
  executionScopeDigest: string
  maximumExposureCount: number
  reservedExposureCount: number
  updatedAt: number
  expiresAt: number
}>

export type ApprovalGrantConsumptionV2 = Readonly<AuthorityLink & {
  format: 'ae.approval-grant-consumption:v2'
  consumptionRef: string
  consumptionDigest: string
  attempt: AttemptLink
  consumedAt: number
}>

export type ActionAttemptIdempotencyClaimV2 = Readonly<AuthorityLink & {
  format: 'ae.action-attempt-idempotency-claim:v2'
  idempotencyClaimRef: string
  idempotencyClaimDigest: string
  admissionKeyDigest: string
  attempt: AttemptLink
  claimedAt: number
}>

export type ActionAttemptSpendReservationV2 = Readonly<AuthorityLink & {
  format: 'ae.action-attempt-spend-reservation:v2'
  spendReservationRef: string
  spendReservationDigest: string
  authorityBudgetRef: string
  state: 'reserved'
  currency: string
  amountMinor: number
  reservedBeforeMinor: number
  reservedAfterMinor: number
  attempt: AttemptLink
  reservedAt: number
  expiresAt: number
}>

export type ActionAttemptDataReservationV2 = Readonly<AuthorityLink & {
  format: 'ae.action-attempt-data-reservation:v2'
  dataReservationRef: string
  dataReservationDigest: string
  authorityBudgetRef: string
  state: 'reserved'
  scope: ApprovalGrantV2['dataScope']
  scopeDigest: string
  exposureDigest: string
  declarationCount: number
  exposureCount: number
  reservedExposureBefore: number
  reservedExposureAfter: number
  attempt: AttemptLink
  reservedAt: number
  expiresAt: number
}>

export type ProviderReleaseGrantV2 = Readonly<AuthorityLink & {
  format: 'ae.provider-release-grant:v2'
  providerReleaseGrantRef: string
  providerReleaseGrantDigest: string
  state: 'unreleased'
  businessId: string
  offeringId: string
  bindingId: string
  attempt: AttemptLink
  issuedAt: number
  expiresAt: number
}>

export type ActionDisclosureGrantV2 = Readonly<AuthorityLink & {
  format: 'ae.disclosure-grant:v2'
  disclosureGrantRef: string
  disclosureGrantDigest: string
  state: 'unreleased'
  bindingId: string
  scope: ApprovalGrantV2['dataScope']
  scopeDigest: string
  exposureDigest: string
  attempt: AttemptLink
  issuedAt: number
  expiresAt: number
}>

export type ActionAttemptAdmissionBundleV2 = Readonly<{
  attempt: ActionAttemptV2
  authorityBudget: ActionAuthorityBudgetV2
  consumption: ApprovalGrantConsumptionV2
  idempotencyClaim: ActionAttemptIdempotencyClaimV2
  spendReservation: ActionAttemptSpendReservationV2
  dataReservation: ActionAttemptDataReservationV2
  providerReleaseGrant: ProviderReleaseGrantV2
  disclosureGrant: ActionDisclosureGrantV2
}>

export type AdmitActionAttemptV2Result =
  | Readonly<{ kind: 'admitted'; bundle: ActionAttemptAdmissionBundleV2 }>
  | Readonly<{ kind: 'refused'; reason:
    | 'approval_grant_invalid'
    | 'approval_grant_expired'
    | 'cumulative_authority_changed'
    | 'cumulative_authority_exhausted'
  }>

export function actionAttemptV2Digest(attempt: ActionAttemptV2): string {
  const { actionAttemptDigest: _digest, ...material } = attempt
  return canonicalDigest(material as StableHashValue)
}

export function actionAuthorityBudgetV2Digest(budget: ActionAuthorityBudgetV2): string {
  const { authorityBudgetDigest: _digest, ...material } = budget
  return canonicalDigest(material as StableHashValue)
}

export function actionAuthorityBudgetV2Ref(authority: ApprovalGrantV2): string {
  return `action-authority-budget:v2:${canonicalDigest({
    preparedActionRef: authority.preparedAction.preparedActionRef,
    preparedActionDigest: authority.preparedAction.preparedActionDigest,
    principalId: authority.lineage.principalId,
    requestId: authority.lineage.requestId,
    requestRevision: authority.lineage.requestRevision,
    actionId: authority.lineage.actionId,
    authorityScopeDigest: authority.disclosure.authorityScopeDigest,
  } as StableHashValue)}`
}

export function admitActionAttemptV2(input: Readonly<{
  approvalGrant: ApprovalGrantV2
  admissionKey: string
  admittedAt: number
  currentAuthorityBudget: ActionAuthorityBudgetV2 | null
}>): AdmitActionAttemptV2Result {
  if (!validApprovalGrant(input.approvalGrant) || !validIdentifier(input.admissionKey)
    || !validTime(input.admittedAt)) {
    return { kind: 'refused', reason: 'approval_grant_invalid' }
  }
  if (input.approvalGrant.expiresAt <= input.admittedAt) {
    return { kind: 'refused', reason: 'approval_grant_expired' }
  }
  const authority = cloneApprovalGrant(input.approvalGrant)
  const authorityLineageDigest = canonicalDigest(authority as StableHashValue)
  const authorityLink: AuthorityLink = {
    approvalGrantRef: authority.approvalGrantRef,
    approvalGrantDigest: authority.approvalGrantDigest,
    authorityLineageDigest,
  }
  const dataScope = authority.dataScope.filter(({ phase }) => phase === 'execution').map(cloneDataUse)
  const scopeDigest = canonicalDigest(dataScope as StableHashValue)
  const exposureUnits = dataScope.flatMap((declaration) => declaration.purposes.map((purpose) => ({
    effectId: declaration.effectId,
    inputPointer: declaration.inputPointer,
    recipient: declaration.recipient,
    purpose,
  })))
  const exposureDigest = canonicalDigest(exposureUnits as StableHashValue)
  const exposureCount = exposureUnits.length
  const authorityBudgetRef = actionAuthorityBudgetV2Ref(authority)
  const budgetBefore = input.currentAuthorityBudget ?? null
  if (budgetBefore !== null && !validAuthorityBudget(budgetBefore, {
    ...authorityLink,
    authorityBudgetRef,
    currency: authority.spend.currency,
    maximumSpendMinor: authority.spend.maximumAmountMinor,
    executionScopeDigest: scopeDigest,
    maximumExposureCount: exposureCount,
    expiresAt: authority.expiresAt,
  })) return { kind: 'refused', reason: 'cumulative_authority_changed' }
  const reservedSpendBefore = budgetBefore?.reservedSpendMinor ?? 0
  const reservedExposureBefore = budgetBefore?.reservedExposureCount ?? 0
  const reservedSpendAfter = reservedSpendBefore + authority.spend.maximumAmountMinor
  const reservedExposureAfter = reservedExposureBefore + exposureCount
  if (!Number.isSafeInteger(reservedSpendAfter) || reservedSpendAfter > authority.spend.maximumAmountMinor
    || !Number.isSafeInteger(reservedExposureAfter) || reservedExposureAfter > exposureCount) {
    return { kind: 'refused', reason: 'cumulative_authority_exhausted' }
  }
  const admissionKeyDigest = canonicalDigest(input.admissionKey)
  const suffix = canonicalDigest({
    approvalGrantRef: authority.approvalGrantRef,
    approvalGrantDigest: authority.approvalGrantDigest,
    admissionKeyDigest,
  } as StableHashValue)
  const refs = {
    actionAttemptRef: `action-attempt:v2:${suffix}`,
    idempotencyClaimRef: `action-attempt-idempotency:v2:${suffix}`,
    spendReservationRef: `action-attempt-spend-reservation:v2:${suffix}`,
    dataReservationRef: `action-attempt-data-reservation:v2:${suffix}`,
    providerReleaseGrantRef: `provider-release-grant:v2:${suffix}`,
    disclosureGrantRef: `disclosure-grant:v2:${suffix}`,
    consumptionRef: `approval-grant-consumption:v2:${authority.approvalGrantDigest}`,
  }
  const attemptMaterial: Omit<ActionAttemptV2, 'actionAttemptDigest'> = {
    format: 'ae.action-attempt:v2', actionAttemptRef: refs.actionAttemptRef, state: 'admitted',
    ...authorityLink, authority, authorityBudgetRef, admissionKeyDigest,
    lineage: cloneLineage(authority.lineage),
    maximumSpend: { currency: authority.spend.currency, amountMinor: authority.spend.maximumAmountMinor },
    recovery: { unknownOutcome: 'reconcile_only', automaticRetry: false },
    idempotencyClaimRef: refs.idempotencyClaimRef,
    spendReservationRef: refs.spendReservationRef,
    dataReservationRef: refs.dataReservationRef,
    providerReleaseGrantRef: refs.providerReleaseGrantRef,
    disclosureGrantRef: refs.disclosureGrantRef,
    admittedAt: input.admittedAt, expiresAt: authority.expiresAt,
  }
  const attempt = {
    ...attemptMaterial,
    actionAttemptDigest: canonicalDigest(attemptMaterial as StableHashValue),
  } as ActionAttemptV2
  const attemptLink = { actionAttemptRef: attempt.actionAttemptRef, actionAttemptDigest: attempt.actionAttemptDigest }
  const authorityBudget = withDigest({
    format: 'ae.action-authority-budget:v2' as const,
    authorityBudgetRef,
    ...authorityLink,
    state: reservedSpendAfter === authority.spend.maximumAmountMinor
      && reservedExposureAfter === exposureCount ? 'exhausted' as const : 'available' as const,
    currency: authority.spend.currency,
    maximumSpendMinor: authority.spend.maximumAmountMinor,
    reservedSpendMinor: reservedSpendAfter,
    executionScopeDigest: scopeDigest,
    maximumExposureCount: exposureCount,
    reservedExposureCount: reservedExposureAfter,
    updatedAt: input.admittedAt,
    expiresAt: authority.expiresAt,
  }, 'authorityBudgetDigest') as ActionAuthorityBudgetV2
  const consumption = withDigest({
    format: 'ae.approval-grant-consumption:v2' as const,
    consumptionRef: refs.consumptionRef, ...authorityLink, attempt: attemptLink, consumedAt: input.admittedAt,
  }, 'consumptionDigest') as ApprovalGrantConsumptionV2
  const idempotencyClaim = withDigest({
    format: 'ae.action-attempt-idempotency-claim:v2' as const,
    idempotencyClaimRef: refs.idempotencyClaimRef, admissionKeyDigest,
    ...authorityLink, attempt: attemptLink, claimedAt: input.admittedAt,
  }, 'idempotencyClaimDigest') as ActionAttemptIdempotencyClaimV2
  const spendReservation = withDigest({
    format: 'ae.action-attempt-spend-reservation:v2' as const,
    spendReservationRef: refs.spendReservationRef, authorityBudgetRef, state: 'reserved' as const,
    currency: authority.spend.currency, amountMinor: authority.spend.maximumAmountMinor,
    reservedBeforeMinor: reservedSpendBefore, reservedAfterMinor: reservedSpendAfter,
    ...authorityLink, attempt: attemptLink, reservedAt: input.admittedAt, expiresAt: authority.expiresAt,
  }, 'spendReservationDigest') as ActionAttemptSpendReservationV2
  const dataReservation = withDigest({
    format: 'ae.action-attempt-data-reservation:v2' as const,
    dataReservationRef: refs.dataReservationRef, authorityBudgetRef, state: 'reserved' as const,
    scope: dataScope, scopeDigest, exposureDigest,
    declarationCount: dataScope.length, exposureCount,
    reservedExposureBefore, reservedExposureAfter,
    ...authorityLink, attempt: attemptLink, reservedAt: input.admittedAt, expiresAt: authority.expiresAt,
  }, 'dataReservationDigest') as ActionAttemptDataReservationV2
  const providerReleaseGrant = withDigest({
    format: 'ae.provider-release-grant:v2' as const,
    providerReleaseGrantRef: refs.providerReleaseGrantRef, state: 'unreleased' as const,
    businessId: authority.supply.businessId,
    offeringId: authority.supply.offering.offeringId,
    bindingId: authority.supply.binding.bindingId,
    ...authorityLink, attempt: attemptLink, issuedAt: input.admittedAt, expiresAt: authority.expiresAt,
  }, 'providerReleaseGrantDigest') as ProviderReleaseGrantV2
  const disclosureGrant = withDigest({
    format: 'ae.disclosure-grant:v2' as const,
    disclosureGrantRef: refs.disclosureGrantRef, state: 'unreleased' as const,
    bindingId: authority.supply.binding.bindingId, scope: dataScope, scopeDigest, exposureDigest,
    ...authorityLink, attempt: attemptLink, issuedAt: input.admittedAt, expiresAt: authority.expiresAt,
  }, 'disclosureGrantDigest') as ActionDisclosureGrantV2
  return deepFreeze({
    kind: 'admitted',
    bundle: {
      attempt, authorityBudget, consumption, idempotencyClaim, spendReservation,
      dataReservation, providerReleaseGrant, disclosureGrant,
    },
  }) as AdmitActionAttemptV2Result
}

function validAuthorityBudget(
  budget: ActionAuthorityBudgetV2,
  expected: Omit<ActionAuthorityBudgetV2, 'format' | 'authorityBudgetDigest' | 'state'
    | 'reservedSpendMinor' | 'reservedExposureCount' | 'updatedAt'>,
): boolean {
  return budget.format === 'ae.action-authority-budget:v2'
    && actionAuthorityBudgetV2Digest(budget) === budget.authorityBudgetDigest
    && budget.authorityBudgetRef === expected.authorityBudgetRef
    && budget.approvalGrantRef === expected.approvalGrantRef
    && budget.approvalGrantDigest === expected.approvalGrantDigest
    && budget.authorityLineageDigest === expected.authorityLineageDigest
    && budget.currency === expected.currency
    && budget.maximumSpendMinor === expected.maximumSpendMinor
    && budget.executionScopeDigest === expected.executionScopeDigest
    && budget.maximumExposureCount === expected.maximumExposureCount
    && budget.expiresAt === expected.expiresAt
    && Number.isSafeInteger(budget.reservedSpendMinor) && budget.reservedSpendMinor >= 0
    && budget.reservedSpendMinor <= budget.maximumSpendMinor
    && Number.isSafeInteger(budget.reservedExposureCount) && budget.reservedExposureCount >= 0
    && budget.reservedExposureCount <= budget.maximumExposureCount
}

function validApprovalGrant(grant: ApprovalGrantV2): boolean {
  return grant.format === 'ae.approval-grant:v2'
    && grant.approvalGrantRef.startsWith('approval-grant:v2:')
    && isCanonicalDigest(grant.approvalGrantDigest)
    && approvalGrantV2Digest(grant) === grant.approvalGrantDigest
    && isCanonicalDigest(grant.preparedAction.preparedActionDigest)
    && sameCapabilityContractRef(grant.lineage.contractRef, grant.capability.contractRef)
    && grant.lineage.selectionKey === grant.capability.selectionKey
    && grant.lineage.semanticDigest === grant.capability.semanticDigest
    && grant.lineage.principalId === grant.actor.principalId
    && grant.spend.currency.trim().length > 0
    && Number.isSafeInteger(grant.spend.maximumAmountMinor) && grant.spend.maximumAmountMinor >= 0
    && validTime(grant.issuedAt) && validTime(grant.expiresAt) && grant.issuedAt < grant.expiresAt
    && isCanonicalDigest(grant.scopeDigest)
    && canonicalDigest({
      dataScope: grant.dataScope,
      effectScope: grant.effectScope,
      evidenceScope: grant.evidenceScope,
      registeredLifecycle: grant.recovery.registeredLifecycle,
    } as StableHashValue) === grant.scopeDigest
    && canonicalDigest(grant.supply.offering.registrationEvidenceRefs as StableHashValue)
      === grant.supply.offering.evidenceDigest
    && canonicalDigest(grant.supply.binding.registrationEvidenceRefs as StableHashValue)
      === grant.supply.binding.evidenceDigest
    && [
      grant.lineage.planDigest, grant.lineage.semanticDigest, grant.lineage.contractRef.contractDigest,
      grant.supply.offering.registrationHash, grant.supply.binding.registrationHash,
      grant.providerAssertion.responseDigest, grant.providerAssertion.outputDigest,
      grant.providerAssertion.evidenceDigest, grant.disclosure.reviewDigest,
      grant.disclosure.authorityScopeDigest,
    ].every(isCanonicalDigest)
}

function cloneApprovalGrant(grant: ApprovalGrantV2): ApprovalGrantV2 {
  return {
    ...grant,
    preparedAction: { ...grant.preparedAction },
    lineage: cloneLineage(grant.lineage),
    capability: { ...grant.capability, contractRef: { ...grant.capability.contractRef } },
    supply: {
      businessId: grant.supply.businessId,
      offering: { ...grant.supply.offering, registrationEvidenceRefs: [...grant.supply.offering.registrationEvidenceRefs] },
      binding: { ...grant.supply.binding, registrationEvidenceRefs: [...grant.supply.binding.registrationEvidenceRefs] },
    },
    providerAssertion: { ...grant.providerAssertion }, spend: { ...grant.spend }, disclosure: { ...grant.disclosure },
    dataScope: grant.dataScope.map(cloneDataUse),
    effectScope: grant.effectScope.map((effect) => ({ ...effect })),
    evidenceScope: grant.evidenceScope.map((evidence) => ({ ...evidence })),
    recovery: { ...grant.recovery, registeredLifecycle: { ...grant.recovery.registeredLifecycle } },
    actor: { ...grant.actor },
  }
}

function cloneLineage(lineage: ApprovalGrantV2['lineage']): ApprovalGrantV2['lineage'] {
  return { ...lineage, contractRef: { ...lineage.contractRef } }
}

function cloneDataUse(declaration: ApprovalGrantV2['dataScope'][number]) {
  return { ...declaration, recipient: { ...declaration.recipient }, purposes: [...declaration.purposes] }
}

function withDigest<T extends object, K extends string>(material: T, key: K): T & Record<K, string> {
  return { ...material, [key]: canonicalDigest(material as StableHashValue) } as T & Record<K, string>
}

function validIdentifier(value: string): boolean {
  return value.trim().length > 0 && value.length <= 500
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
