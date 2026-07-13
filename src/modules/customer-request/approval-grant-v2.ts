import {
  openCapabilityDecisionModel,
  sameCapabilityContractRef,
  type CapabilityContract,
  type JsonValue,
} from '@/modules/capability-contract/public'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import { preparedActionV2Digest, type PreparedActionV2 } from './prepared-action-v2'

export type VerifiedApprovalGrantActor = Readonly<{
  kind: 'clerk_owner'
  requestPrincipalId: string
  ownerId: string
  credentialId: string
  authenticationEvidenceRef: string
}>

type ApprovalGrantEvidenceScope = Readonly<{
  evidenceId: string
  outputPointer: string
  purpose: 'comparison' | 'completion' | 'recovery'
  schemaIdentity: string
  valueDigest: string
}>

export type ApprovalGrantV2 = Readonly<{
  format: 'ae.approval-grant:v2'
  approvalGrantRef: string
  approvalGrantDigest: string
  preparedAction: Readonly<{ preparedActionRef: string; preparedActionDigest: string }>
  lineage: PreparedActionV2['lineage']
  capability: Readonly<{
    contractRef: PreparedActionV2['lineage']['contractRef']
    selectionKey: string
    semanticDigest: string
  }>
  supply: Readonly<{
    businessId: string
    offering: Readonly<{
      offeringId: string
      registrationHash: string
      registrationEvidenceRefs: readonly string[]
      evidenceDigest: string
    }>
    binding: Readonly<{
      bindingId: string
      registrationHash: string
      registrationEvidenceRefs: readonly string[]
      evidenceDigest: string
    }>
  }>
  providerAssertion: Readonly<{
    assertionRef: string
    operationRef: string
    assertedAt: number
    validUntil: number
    responseDigest: string
    outputDigest: string
    evidenceDigest: string
  }>
  spend: Readonly<{ currency: string; maximumAmountMinor: number }>
  disclosure: Readonly<{
    reviewRef: string
    reviewDigest: string
    authorityScopeDigest: string
  }>
  dataScope: CapabilityContract['dataUse']
  effectScope: CapabilityContract['effects']
  evidenceScope: readonly ApprovalGrantEvidenceScope[]
  scopeDigest: string
  recovery: Readonly<{
    unknownOutcome: 'reconcile_only'
    automaticRetry: false
    registeredLifecycle: CapabilityContract['lifecycle']
  }>
  actor: Readonly<{
    kind: 'clerk_owner'
    principalId: string
    ownerId: string
    credentialId: string
    authenticationEvidenceRef: string
  }>
  issuedAt: number
  expiresAt: number
}>

export type IssueApprovalGrantV2Result =
  | Readonly<{ kind: 'issued'; approvalGrant: ApprovalGrantV2 }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'approval_material_invalid'
        | 'prepared_action_expired'
        | 'spend_scope_invalid'
        | 'expiry_scope_invalid'
        | 'capability_authority_changed'
    }>

export function approvalGrantV2Digest(grant: ApprovalGrantV2): string {
  const { approvalGrantDigest: _digest, ...material } = grant
  return canonicalDigest(material as StableHashValue)
}

export function issueApprovalGrantV2(input: Readonly<{
  preparedAction: PreparedActionV2
  contract: CapabilityContract
  preparation: Readonly<{ reviewRef: string; reviewDigest: string; authorityScopeDigest: string }>
  actor: VerifiedApprovalGrantActor
  maximumSpendMinor: number
  expiresAt: number
  now: number
}>): IssueApprovalGrantV2Result {
  if (!validTime(input.now) || !validIdentifier(input.preparation.reviewRef)
    || !isCanonicalDigest(input.preparation.reviewDigest)
    || !isCanonicalDigest(input.preparation.authorityScopeDigest)
    || !validActor(input.actor)) {
    return { kind: 'refused', reason: 'approval_material_invalid' }
  }
  const action = input.preparedAction
  if (!action.preparedActionRef.startsWith('prepared-action:v2:')
    || !isCanonicalDigest(action.preparedActionDigest)
    || preparedActionV2Digest(action) !== action.preparedActionDigest) {
    return { kind: 'refused', reason: 'approval_material_invalid' }
  }
  if (action.expiresAt <= input.now || action.providerAssertion.validUntil <= input.now) {
    return { kind: 'refused', reason: 'prepared_action_expired' }
  }
  if (input.actor.requestPrincipalId !== action.lineage.principalId
    || input.preparation.authorityScopeDigest !== action.disclosure.authorityScopeDigest
    || input.preparation.reviewRef !== `action-preparation-review:${input.preparation.reviewDigest}`
    || !sameCapabilityContractRef(input.contract.ref, action.lineage.contractRef)) {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  if (!Number.isSafeInteger(input.maximumSpendMinor)
    || input.maximumSpendMinor < action.price.minimumAmountMinor
    || input.maximumSpendMinor > action.price.maximumAmountMinor) {
    return { kind: 'refused', reason: 'spend_scope_invalid' }
  }
  if (!validTime(input.expiresAt) || input.expiresAt <= input.now
    || input.expiresAt > action.expiresAt || input.expiresAt > action.providerAssertion.validUntil) {
    return { kind: 'refused', reason: 'expiry_scope_invalid' }
  }

  let model: ReturnType<typeof openCapabilityDecisionModel>
  try {
    model = openCapabilityDecisionModel(input.contract)
  } catch {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  if (model.selectionKey !== action.lineage.selectionKey
    || model.semanticDigest !== action.lineage.semanticDigest) {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  const validatedOutput = model.validateOutput(action.providerAssertion.output)
  if (validatedOutput.kind !== 'valid'
    || canonicalDigest(validatedOutput.value as StableHashValue) !== action.providerAssertion.outputDigest) {
    return { kind: 'refused', reason: 'approval_material_invalid' }
  }
  const evidenceScope = action.providerAssertion.evidence.map((evidence): ApprovalGrantEvidenceScope | undefined => {
    const requirement = model.evidence.find((candidate) => (
      candidate.evidenceId === evidence.evidenceId
      && candidate.outputPointer === evidence.outputPointer
      && candidate.purpose === evidence.purpose
      && candidate.schemaIdentity === evidence.schemaIdentity
    ))
    const value = requirement === undefined ? undefined : readJsonPointer(
      validatedOutput.value, requirement.outputPointer,
    )
    return requirement === undefined || value === undefined || !isCanonicalDigest(evidence.valueDigest)
      || canonicalDigest(value as StableHashValue) !== evidence.valueDigest ? undefined : {
      evidenceId: evidence.evidenceId,
      outputPointer: evidence.outputPointer,
      purpose: evidence.purpose,
      schemaIdentity: evidence.schemaIdentity,
      valueDigest: evidence.valueDigest,
    }
  })
  const exactEvidenceScope = evidenceScope.flatMap((evidence) => evidence === undefined ? [] : [evidence])
  const uniqueEvidenceIds = new Set(exactEvidenceScope.map(({ evidenceId }) => evidenceId))
  const mandatoryEvidencePresent = model.evidence.every((requirement) => (
    (!requirement.guaranteed && requirement.purpose !== 'comparison')
    || exactEvidenceScope.some(({ evidenceId }) => evidenceId === requirement.evidenceId)
  ))
  if (evidenceScope.some((evidence) => evidence === undefined)
    || uniqueEvidenceIds.size !== exactEvidenceScope.length || !mandatoryEvidencePresent) {
    return { kind: 'refused', reason: 'capability_authority_changed' }
  }
  const dataScope = input.contract.dataUse.map((declaration) => ({
    ...declaration,
    recipient: { ...declaration.recipient },
    purposes: [...declaration.purposes],
  }))
  const effectScope = input.contract.effects.map((effect) => ({ ...effect }))
  const scopeDigest = canonicalDigest({
    dataScope, effectScope, evidenceScope: exactEvidenceScope,
    registeredLifecycle: input.contract.lifecycle,
  } as StableHashValue)
  const material: Omit<ApprovalGrantV2, 'approvalGrantDigest'> = {
    format: 'ae.approval-grant:v2',
    approvalGrantRef: `approval-grant:v2:${canonicalDigest({
      preparedActionRef: action.preparedActionRef,
      preparedActionDigest: action.preparedActionDigest,
      principalId: action.lineage.principalId,
      maximumSpendMinor: input.maximumSpendMinor,
      expiresAt: input.expiresAt,
      issuedAt: input.now,
    } as StableHashValue)}`,
    preparedAction: {
      preparedActionRef: action.preparedActionRef,
      preparedActionDigest: action.preparedActionDigest,
    },
    lineage: { ...action.lineage, contractRef: { ...action.lineage.contractRef } },
    capability: {
      contractRef: { ...action.lineage.contractRef },
      selectionKey: action.lineage.selectionKey,
      semanticDigest: action.lineage.semanticDigest,
    },
    supply: {
      businessId: action.business.businessId,
      offering: {
        offeringId: action.offering.offeringId,
        registrationHash: action.offering.registrationHash,
        registrationEvidenceRefs: [...action.offering.registrationEvidenceRefs],
        evidenceDigest: canonicalDigest(action.offering.registrationEvidenceRefs as StableHashValue),
      },
      binding: {
        bindingId: action.binding.bindingId,
        registrationHash: action.binding.registrationHash,
        registrationEvidenceRefs: [...action.binding.registrationEvidenceRefs],
        evidenceDigest: canonicalDigest(action.binding.registrationEvidenceRefs as StableHashValue),
      },
    },
    providerAssertion: {
      assertionRef: action.providerAssertion.assertionRef,
      operationRef: action.providerAssertion.operationRef,
      assertedAt: action.providerAssertion.assertedAt,
      validUntil: action.providerAssertion.validUntil,
      responseDigest: action.providerAssertion.responseDigest,
      outputDigest: action.providerAssertion.outputDigest,
      evidenceDigest: canonicalDigest(action.providerAssertion.evidence as StableHashValue),
    },
    spend: { currency: action.price.currency, maximumAmountMinor: input.maximumSpendMinor },
    disclosure: {
      reviewRef: input.preparation.reviewRef,
      reviewDigest: input.preparation.reviewDigest,
      authorityScopeDigest: input.preparation.authorityScopeDigest,
    },
    dataScope,
    effectScope,
    evidenceScope: exactEvidenceScope,
    scopeDigest,
    recovery: {
      unknownOutcome: 'reconcile_only',
      automaticRetry: false,
      registeredLifecycle: { ...input.contract.lifecycle },
    },
    actor: {
      kind: input.actor.kind,
      principalId: input.actor.requestPrincipalId,
      ownerId: input.actor.ownerId,
      credentialId: input.actor.credentialId,
      authenticationEvidenceRef: input.actor.authenticationEvidenceRef,
    },
    issuedAt: input.now,
    expiresAt: input.expiresAt,
  }
  const approvalGrant = {
    ...material,
    approvalGrantDigest: canonicalDigest(material as StableHashValue),
  } as ApprovalGrantV2
  return deepFreeze({ kind: 'issued', approvalGrant }) as IssueApprovalGrantV2Result
}

function validActor(actor: VerifiedApprovalGrantActor): boolean {
  return actor.kind === 'clerk_owner'
    && validIdentifier(actor.requestPrincipalId)
    && validIdentifier(actor.ownerId)
    && validIdentifier(actor.credentialId)
    && validIdentifier(actor.authenticationEvidenceRef)
}

function validIdentifier(value: string): boolean {
  return value.trim().length > 0 && value.length <= 500
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function readJsonPointer(document: JsonValue, pointer: string): JsonValue | undefined {
  let current: JsonValue | undefined = document
  for (const segment of pointer.split('/').slice(1)) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return undefined
      current = current[Number(key)]
    } else if (current !== null && typeof current === 'object') {
      current = (current as Readonly<Record<string, JsonValue>>)[key]
    } else return undefined
  }
  return current
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
