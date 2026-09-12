import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  addExactAmounts,
  compareExactAmounts,
  sameExactScale,
  subtractExactAmounts,
  sumExactAmounts,
  type ExactAmount,
} from '@/modules/money/public'
import { deepFreeze } from '@/modules/common/deep-freeze'
import {
  verifiedGrantMatchesSpendingPolicy,
  type VerifiedSpendingPolicyGrant,
} from './spending-policy-grant'
import type { SpendingPolicyAuthorityBasis } from './contracts'
import {
  canonicalAuthorityExposureOffsetMaterial,
  canonicalAuthorityUseMaterial,
  canonicalSpendingPolicyMaterial,
  authorityUseIntegrityValid,
  policyDecisionIntegrityValid,
  spendingPolicyIntegrityValid,
} from './spending-policy-integrity'
import {
  SPENDING_POLICY_FORMAT,
  type AuthorityExposureOffset,
  type AuthorityUse,
  type AuthorityUseMaterial,
  type SpendingPolicy,
  type SpendingPolicyDecision,
  type SpendingPolicyRefusalCode,
  type SpendingPolicyResult,
  type SpendingPolicyScope,
} from './spending-policy-types'
import {
  verifyExposureReleaseAttestation,
  type ExposureOffsetRuleIdentity,
} from './exposure-offset-rules'
import {
  authorityUseMaterialValid,
  exposureOffsetMaterialValid,
  isoTimestampValid,
  parseSpendingPolicyInput,
  parseSpendingPolicySnapshot,
  policyDecisionMaterialValid,
  spendingPolicyMaterialValid,
} from './spending-policy-validation'

export {
  SPENDING_POLICY_FORMAT,
  type AuthorityExposureOffset,
  type AuthorityUse,
  type AuthorityUseMaterial,
  type SpendingPolicy,
  type SpendingPolicyRefusalCode,
  type SpendingPolicyResult,
  type SpendingPolicyScope,
}
export { spendingPolicyIntegrityValid, authorityUseIntegrityValid, policyDecisionIntegrityValid }

export type SpendingPolicySnapshot = Readonly<{
  format: 'ae.action-invocation-standing-mandate-store:v1'
  mandates: readonly SpendingPolicy[]
  grants: readonly VerifiedSpendingPolicyGrant[]
  uses: readonly AuthorityUse[]
  exposureOffsets?: readonly AuthorityExposureOffset[]
  policyDecisions?: readonly SpendingPolicyDecision[]
}>

export function issueSpendingPolicy(
  input: unknown,
): SpendingPolicyResult<SpendingPolicy> {
  const parsed = parseSpendingPolicyInput(input)
  if (!parsed.success) return { kind: 'refused', code: 'spending_policy_material_invalid' }
  const { mode = 'spending_policy', scope: parsedScope, ...rest } = parsed.data
  const scope: SpendingPolicyScope = {
    objective: parsedScope.objective,
    action: parsedScope.action,
    ...(parsedScope.actions === undefined ? {} : { actions: parsedScope.actions }),
    providerRefs: parsedScope.providerRefs,
    recipientRefs: parsedScope.recipientRefs,
    purposes: parsedScope.purposes,
    allowedDataFields: parsedScope.allowedDataFields,
    maximumSpend: parsedScope.maximumSpend,
    maximumActionCount: parsedScope.maximumActionCount,
    maximumConcurrentReservations: parsedScope.maximumConcurrentReservations,
    startsAt: parsedScope.startsAt,
    expiresAt: parsedScope.expiresAt,
    permittedFallbacks: parsedScope.permittedFallbacks,
    riskCeiling: parsedScope.riskCeiling,
    ...(parsedScope.maximumLoss === undefined ? {} : { maximumLoss: parsedScope.maximumLoss }),
    ...(parsedScope.exposureOffsetRules === undefined ? {} : {
      exposureOffsetRules: parsedScope.exposureOffsetRules,
    }),
    ...(parsedScope.exposureOffsetVerificationKeys === undefined ? {} : {
      exposureOffsetVerificationKeys: parsedScope.exposureOffsetVerificationKeys,
    }),
  }
  const material: Omit<SpendingPolicy, 'digest'> = {
    ...rest,
    scope,
    format: SPENDING_POLICY_FORMAT,
    mode,
    revoked: false as const,
  }
  return {
    kind: 'accepted',
    value: deepFreeze({
      ...material,
      digest: canonicalDigest(canonicalSpendingPolicyMaterial(material)),
    }),
  }
}

export function restoreSpendingPolicyStore(
  snapshot: unknown,
): SpendingPolicyResult<SpendingPolicyStore> {
  const parsed = parseSpendingPolicySnapshot(snapshot)
  if (!parsed.success) return { kind: 'refused', code: 'spending_policy_material_invalid' }
  try {
    return {
      kind: 'accepted',
      value: new SpendingPolicyStore(parsed.data as SpendingPolicySnapshot),
    }
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused', code: 'spending_policy_material_invalid' } as const, {
      site: 'restoreSpendingPolicyStore',
      reason: 'invalid_response',
    })
  }
}

export class SpendingPolicyStore {
  readonly #mandates = new Map<string, SpendingPolicy>()
  readonly #uses = new Map<string, AuthorityUse>()
  readonly #grants = new Map<string, VerifiedSpendingPolicyGrant>()
  readonly #exposureOffsets = new Map<string, AuthorityExposureOffset>()
  readonly #policyDecisions = new Map<string, SpendingPolicyDecision>()
  readonly #usedOffsetUses = new Set<string>()
  readonly #usedOffsetEvidence = new Set<string>()
  constructor(snapshot?: SpendingPolicySnapshot) {
    if (snapshot !== undefined && !parseSpendingPolicySnapshot(snapshot).success) {
      throw new Error('spending_policy_snapshot_material_refused')
    }
    for (const mandate of snapshot?.mandates ?? []) {
      if (!spendingPolicyIntegrityValid(mandate)) throw new Error('spending_policy_snapshot_integrity_refused')
      this.#mandates.set(mandate.spendingPolicyRef, deepFreeze(structuredClone(mandate)))
    }
    for (const grant of snapshot?.grants ?? []) {
      const mandate = this.#mandates.get(grant.spendingPolicyRef)
      if (mandate === undefined || !verifiedGrantMatchesSpendingPolicy(grant, mandate, grant.verifiedAt)) {
        throw new Error('spending_policy_snapshot_grant_refused')
      }
      this.#grants.set(grant.spendingPolicyRef, deepFreeze(structuredClone(grant)))
    }
    for (const use of snapshot?.uses ?? []) {
      if (!authorityUseIntegrityValid(use) || !this.#useLinkageValid(use)) {
        throw new Error('spending_policy_snapshot_authority_use_refused')
      }
      this.#uses.set(use.authorityUseRef, deepFreeze(structuredClone(use)))
    }
    for (const decision of snapshot?.policyDecisions ?? []) {
      if (!policyDecisionIntegrityValid(decision)) {
        throw new Error('spending_policy_snapshot_policy_decision_refused')
      }
      this.#policyDecisions.set(decision.policyDecisionRef, deepFreeze(structuredClone(decision)))
    }
    for (const use of this.#uses.values()) {
      const mandate = this.#mandates.get(use.spendingPolicyRef)
      if (mandate?.mode === 'unrestricted_test_only' && !this.#policyUseLinkageValid(use)) {
        throw new Error('spending_policy_snapshot_policy_use_linkage_refused')
      }
    }
    for (const offset of snapshot?.exposureOffsets ?? []) {
      if (!exposureOffsetMaterialValid(offset)) {
        throw new Error('spending_policy_snapshot_exposure_offset_refused')
      }
      const { digest, ...material } = offset
      const use = this.#uses.get(offset.authorityUseRef)
      const offsetUse = this.#uses.get(offset.offsetAuthorityUseRef)
      const offsetLimit = use === undefined ? undefined : use.reservedLoss ?? use.reservedSpend
      const offsetComparison = offsetLimit === undefined || !sameExactScale(offset.amount, offsetLimit)
        ? undefined
        : compareExactAmounts(offset.amount, offsetLimit)
      if (
        digest !== canonicalDigest(canonicalAuthorityExposureOffsetMaterial(material))
        || use === undefined
        || offsetUse === undefined
        || use.state !== 'released'
        || offset.spendingPolicyRef !== use.spendingPolicyRef
        || offset.spendingPolicyRef !== offsetUse.spendingPolicyRef
        || offset.spendingPolicyVersion !== use.spendingPolicyVersion
        || offset.spendingPolicyGeneration !== use.spendingPolicyGeneration
        || offset.principalRef !== use.principalRef
        || offset.principalRef !== offsetUse.principalRef
        || offset.providerRef !== use.providerRef
        || offset.providerRef !== offsetUse.providerRef
        || use.action.id !== offset.exposureAction.id
        || use.action.version !== offset.exposureAction.version
        || offsetUse.action.id !== offset.offsetAction.id
        || offsetUse.action.version !== offset.offsetAction.version
        || offsetUse.state !== 'released'
        || !this.#offsetRuleAllowed(offset, use.spendingPolicyRef)
        || !this.#offsetAttestationValid(offset)
        || offset.exposureSubjectRef !== offset.offsetSubjectRef
        || offset.offsetGeneration !== 1
        || this.#usedOffsetUses.has(offset.offsetAuthorityUseRef)
        || this.#usedOffsetEvidence.has(offset.offsetEvidenceRef)
        || offsetComparison === undefined
        || offsetComparison > 0
      ) throw new Error('spending_policy_snapshot_exposure_offset_refused')
      this.#exposureOffsets.set(offset.authorityUseRef, deepFreeze(structuredClone(offset)))
      this.#usedOffsetUses.add(offset.offsetAuthorityUseRef)
      this.#usedOffsetEvidence.add(offset.offsetEvidenceRef)
    }
  }

  issue(
    mandate: SpendingPolicy,
    admission: VerifiedSpendingPolicyGrant,
    now: string,
  ): SpendingPolicyResult<SpendingPolicy> {
    if (!spendingPolicyMaterialValid(mandate)) return { kind: 'refused', code: 'spending_policy_material_invalid' }
    if (!spendingPolicyIntegrityValid(mandate)) return { kind: 'refused', code: 'spending_policy_integrity_invalid' }
    if (!isoTimestampValid(now)) return { kind: 'refused', code: 'spending_policy_material_invalid' }
    if (!verifiedGrantMatchesSpendingPolicy(admission, mandate, now)) {
      return { kind: 'refused', code: 'spending_policy_grant_unauthenticated' }
    }
    const prior = this.#mandates.get(mandate.spendingPolicyRef)
    if (prior !== undefined) {
      return prior.digest === mandate.digest
        ? { kind: 'accepted', value: prior }
        : { kind: 'refused', code: 'authority_use_conflict' }
    }
    this.#mandates.set(mandate.spendingPolicyRef, mandate)
    this.#grants.set(mandate.spendingPolicyRef, admission)
    return { kind: 'accepted', value: mandate }
  }

  revoke(input: Readonly<{
    spendingPolicyRef: string
    expectedGeneration: number
    reason: string
    revokedAt: string
  }>): SpendingPolicyResult<SpendingPolicy> {
    if (
      input.spendingPolicyRef.length === 0
      || !Number.isSafeInteger(input.expectedGeneration)
      || input.expectedGeneration < 1
      || input.reason.length === 0
      || !isoTimestampValid(input.revokedAt)
    ) return { kind: 'refused', code: 'spending_policy_material_invalid' }
    const current = this.#mandates.get(input.spendingPolicyRef)
    if (current === undefined) return { kind: 'refused', code: 'spending_policy_not_found' }
    if (current.generation !== input.expectedGeneration) {
      return { kind: 'refused', code: 'spending_policy_generation_stale' }
    }
    if (current.generation === Number.MAX_SAFE_INTEGER) {
      return { kind: 'refused', code: 'spending_policy_material_invalid' }
    }
    const material = {
      ...current,
      generation: current.generation + 1,
      revoked: { reason: input.reason, revokedAt: input.revokedAt },
    }
    const { digest: _digest, ...withoutDigest } = material
    const revoked = deepFreeze({
      ...withoutDigest,
      digest: canonicalDigest(canonicalSpendingPolicyMaterial(withoutDigest)),
    })
    if (!spendingPolicyIntegrityValid(revoked)) {
      return { kind: 'refused', code: 'spending_policy_material_invalid' }
    }
    this.#mandates.set(current.spendingPolicyRef, revoked)
    return { kind: 'accepted', value: revoked }
  }

  reserve(material: AuthorityUseMaterial, now: string): SpendingPolicyResult<AuthorityUse> {
    if (!authorityUseMaterialValid(material) || !isoTimestampValid(now)) {
      return { kind: 'refused', code: 'spending_policy_material_invalid' }
    }
    const prior = this.#uses.get(material.authorityUseRef)
    if (prior !== undefined) {
      const candidateDigest = canonicalDigest(canonicalAuthorityUseMaterial({ ...material, state: 'reserved', reservedAt: now }))
      return prior.digest === candidateDigest
        ? { kind: 'accepted', value: prior }
        : { kind: 'refused', code: 'authority_use_conflict' }
    }
    const validation = this.#validateScope(material, now)
    if (validation !== undefined) return { kind: 'refused', code: validation }
    const useMaterial = { ...material, state: 'reserved' as const, reservedAt: now }
    const use = deepFreeze({ ...useMaterial, digest: canonicalDigest(canonicalAuthorityUseMaterial(useMaterial)) })
    this.#uses.set(use.authorityUseRef, use)
    return { kind: 'accepted', value: use }
  }

  acceptPolicyDecision(decision: SpendingPolicyDecision): SpendingPolicyResult<SpendingPolicyDecision> {
    if (!policyDecisionMaterialValid(decision)) {
      return { kind: 'refused', code: 'spending_policy_material_invalid' }
    }
    if (!policyDecisionIntegrityValid(decision)) {
      return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    }
    const mandate = this.#mandates.get(decision.spendingPolicyRef)
    const currentCapacity = this.capacity(decision.spendingPolicyRef)
    const { consumedSpend, reservedSpend, worstCaseLoss } = currentCapacity
    const mandateUses = [...this.#uses.values()].filter((use) => use.spendingPolicyRef === decision.spendingPolicyRef)
    const currentCommittedSpend = consumedSpend === undefined
      || reservedSpend === undefined
      || !sameExactScale(consumedSpend, reservedSpend)
      ? undefined
      : addExactAmounts(consumedSpend, reservedSpend)
    const committedSpendWithUses = mandate === undefined
      ? undefined
      : sumExactAmounts(
        mandateUses
          .filter((use) => use.state !== 'not_released')
          .map((use) => use.reservedSpend),
        mandate.scope.maximumSpend,
      )
    const committedSpendWithProposal = committedSpendWithUses === undefined
      || !sameExactScale(committedSpendWithUses, decision.proposal.spend)
      ? undefined
      : addExactAmounts(committedSpendWithUses, decision.proposal.spend)
    const committedSpendComparison = committedSpendWithProposal === undefined || mandate === undefined
      ? undefined
      : compareExactAmounts(committedSpendWithProposal, mandate.scope.maximumSpend)
    if (
      mandate === undefined
      || mandate.mode !== 'unrestricted_test_only'
      || !sameExactScale(decision.proposal.spend, mandate.scope.maximumSpend)
      || !sameExactScale(
        decision.proposal.worstCaseLoss,
        mandate.scope.maximumLoss ?? mandate.scope.maximumSpend,
      )
      || !sameExactScale(decision.proposedWorstCaseLoss, decision.proposal.worstCaseLoss)
      || compareExactAmounts(decision.proposedWorstCaseLoss, decision.proposal.worstCaseLoss) !== 0
      || !sameExactScale(decision.maximumLoss, mandate.scope.maximumLoss ?? mandate.scope.maximumSpend)
      || compareExactAmounts(
        decision.maximumLoss,
        mandate.scope.maximumLoss ?? mandate.scope.maximumSpend,
      ) !== 0
      || decision.spendingPolicyVersion !== mandate.version
      || decision.spendingPolicyGeneration !== mandate.generation
      || decision.proposal.objective !== mandate.scope.objective
      || decision.capacity.consumedCount !== currentCapacity.consumedCount
      || decision.capacity.reservedCount !== currentCapacity.reservedCount
      || currentCommittedSpend === undefined
      || !sameExactScale(decision.capacity.committedSpend, currentCommittedSpend)
      || compareExactAmounts(decision.capacity.committedSpend, currentCommittedSpend) !== 0
      || worstCaseLoss === undefined
      || !sameExactScale(decision.capacity.heldWorstCaseLoss, worstCaseLoss)
      || !sameExactScale(decision.heldWorstCaseLoss, worstCaseLoss)
      || compareExactAmounts(decision.capacity.heldWorstCaseLoss, worstCaseLoss) !== 0
      || compareExactAmounts(decision.heldWorstCaseLoss, worstCaseLoss) !== 0
      || committedSpendWithProposal === undefined
      || committedSpendComparison === undefined
      || committedSpendComparison > 0
    ) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    const prior = this.#policyDecisions.get(decision.policyDecisionRef)
    if (prior !== undefined) {
      return prior.digest === decision.digest
        ? { kind: 'accepted', value: prior }
        : { kind: 'refused', code: 'authority_use_conflict' }
    }
    this.#policyDecisions.set(decision.policyDecisionRef, deepFreeze(structuredClone(decision)))
    return { kind: 'accepted', value: decision }
  }

  recheckBeforeRelease(token: Readonly<{
    authorityUseRef: string
    executionRef: string
    acceptedBasis: SpendingPolicyAuthorityBasis
    action: Readonly<{ id: string; version: string }>
    preparedMaterialDigest: string
    actor: Readonly<{ callerRef: string; principalRef: string }>
    delegateRef: string
    effectGeneration: number
  }>, now: string): SpendingPolicyResult<AuthorityUse> {
    if (!isoTimestampValid(now)) return { kind: 'refused', code: 'spending_policy_material_invalid' }
    const use = this.#uses.get(token.authorityUseRef)
    if (use === undefined) return { kind: 'refused', code: 'authority_use_not_found' }
    if (use.state !== 'reserved') return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    if (
      use.executionRef !== token.executionRef
      || use.action.id !== token.action.id
      || use.action.version !== token.action.version
      || use.preparedMaterialDigest !== token.preparedMaterialDigest
      || use.callerRef !== token.actor.callerRef
      || use.principalRef !== token.actor.principalRef
      || use.delegateRef !== token.delegateRef
      || use.effectGeneration !== token.effectGeneration
      || token.acceptedBasis.authorityUseRef !== use.authorityUseRef
      || token.acceptedBasis.spendingPolicyRef !== use.spendingPolicyRef
      || token.acceptedBasis.spendingPolicyVersion !== use.spendingPolicyVersion
      || token.acceptedBasis.spendingPolicyGeneration !== use.spendingPolicyGeneration
      || token.acceptedBasis.grantEvidenceRef !== this.#grants.get(use.spendingPolicyRef)?.evidenceRef
    ) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    const validation = this.#validateScope(use, now, token.authorityUseRef)
    return validation === undefined
      ? { kind: 'accepted', value: use }
      : { kind: 'refused', code: validation }
  }

  settle(
    authorityUseRef: string,
    state: 'not_released' | 'released' | 'uncertain',
    settledAt: string,
  ): SpendingPolicyResult<AuthorityUse> {
    if (!isoTimestampValid(settledAt)) return { kind: 'refused', code: 'spending_policy_material_invalid' }
    const use = this.#uses.get(authorityUseRef)
    if (use === undefined) return { kind: 'refused', code: 'authority_use_not_found' }
    if (
      use.state !== 'reserved'
      && !(use.state === 'uncertain' && (state === 'released' || state === 'not_released'))
    ) {
      return use.state === state
        ? { kind: 'accepted', value: use }
        : { kind: 'refused', code: 'authority_use_linkage_invalid' }
    }
    const { digest: _digest, ...prior } = use
    const material = { ...prior, state, settledAt }
    const settled = deepFreeze({ ...material, digest: canonicalDigest(canonicalAuthorityUseMaterial(material)) })
    if (!authorityUseIntegrityValid(settled)) {
      return { kind: 'refused', code: 'spending_policy_material_invalid' }
    }
    this.#uses.set(authorityUseRef, settled)
    return { kind: 'accepted', value: settled }
  }

  inspectSpendingPolicy(spendingPolicyRef: string) { return this.#mandates.get(spendingPolicyRef) }
  inspectGrant(spendingPolicyRef: string) { return this.#grants.get(spendingPolicyRef) }
  inspectUse(authorityUseRef: string) { return this.#uses.get(authorityUseRef) }

  recordExposureOffset(
    input: Omit<AuthorityExposureOffset, 'digest'>,
  ): SpendingPolicyResult<AuthorityExposureOffset> {
    const use = this.#uses.get(input.authorityUseRef)
    const offsetUse = this.#uses.get(input.offsetAuthorityUseRef)
    const offsetLimit = use === undefined ? undefined : use.reservedLoss ?? use.reservedSpend
    const offsetComparison = offsetLimit === undefined || !sameExactScale(input.amount, offsetLimit)
      ? undefined
      : compareExactAmounts(input.amount, offsetLimit)
    if (
      use === undefined
      || offsetUse === undefined
      || use.state !== 'released'
      || offsetUse.state !== 'released'
      || input.spendingPolicyRef !== use.spendingPolicyRef
      || input.spendingPolicyRef !== offsetUse.spendingPolicyRef
      || input.spendingPolicyVersion !== use.spendingPolicyVersion
      || input.spendingPolicyGeneration !== use.spendingPolicyGeneration
      || input.principalRef !== use.principalRef
      || input.principalRef !== offsetUse.principalRef
      || input.providerRef !== use.providerRef
      || input.providerRef !== offsetUse.providerRef
      || input.exposureAction.id !== use.action.id
      || input.exposureAction.version !== use.action.version
      || offsetUse.action.id !== input.offsetAction.id
      || offsetUse.action.version !== input.offsetAction.version
      || !this.#offsetRuleAllowed(input, input.spendingPolicyRef)
      || !this.#offsetAttestationValid(input)
      || input.exposureSubjectRef !== input.offsetSubjectRef
      || input.exposureResultRef.length === 0
      || input.exposureEvidenceRef.length === 0
      || input.offsetResultRef.length === 0
      || input.offsetEvidenceRef.length === 0
      || input.offsetGeneration !== 1
      || this.#usedOffsetUses.has(input.offsetAuthorityUseRef)
      || this.#usedOffsetEvidence.has(input.offsetEvidenceRef)
      || offsetComparison === undefined
      || offsetComparison > 0
    ) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    const material = { ...input }
    const offset = deepFreeze({
      ...material,
      digest: canonicalDigest(canonicalAuthorityExposureOffsetMaterial(material)),
    })
    const prior = this.#exposureOffsets.get(input.authorityUseRef)
    if (prior !== undefined) {
      return prior.digest === offset.digest
        ? { kind: 'accepted', value: prior }
        : { kind: 'refused', code: 'authority_use_conflict' }
    }
    this.#exposureOffsets.set(input.authorityUseRef, offset)
    this.#usedOffsetUses.add(input.offsetAuthorityUseRef)
    this.#usedOffsetEvidence.add(input.offsetEvidenceRef)
    return { kind: 'accepted', value: offset }
  }

  capacity(spendingPolicyRef: string) {
    const mandate = this.#mandates.get(spendingPolicyRef)
    const uses = [...this.#uses.values()].filter((use) => use.spendingPolicyRef === spendingPolicyRef)
    const consumed = uses.filter((use) => use.state === 'released')
    const active = uses.filter((use) => use.state === 'reserved' || use.state === 'uncertain')
    const amountReference = mandate?.scope.maximumSpend ?? uses[0]?.reservedSpend
    const lossReference = mandate?.scope.maximumLoss ?? amountReference
    const consumedSpend = amountReference === undefined
      ? undefined
      : sumExactAmounts(consumed.map((use) => use.reservedSpend), amountReference)
    const reservedSpend = amountReference === undefined
      ? undefined
      : sumExactAmounts(active.map((use) => use.reservedSpend), amountReference)
    const lossAmounts = uses
      .filter((use) => use.state !== 'not_released')
      .map((use) => effectiveLossAmount(use, this.#exposureOffsets.get(use.authorityUseRef)?.amount))
    const validLossAmounts = lossAmounts.filter((amount): amount is ExactAmount => amount !== undefined)
    const worstCaseLoss = lossReference === undefined || validLossAmounts.length !== lossAmounts.length
      ? undefined
      : sumExactAmounts(validLossAmounts, lossReference)
    return {
      maximumActionCount: mandate?.scope.maximumActionCount ?? 0,
      consumedCount: consumed.length,
      reservedCount: active.length,
      consumedSpend,
      reservedSpend,
      worstCaseLoss,
    }
  }

  exportSnapshot(): SpendingPolicySnapshot {
    return deepFreeze({
      format: 'ae.action-invocation-standing-mandate-store:v1',
      mandates: [...this.#mandates.values()],
      grants: [...this.#grants.values()],
      uses: [...this.#uses.values()],
      exposureOffsets: [...this.#exposureOffsets.values()],
      policyDecisions: [...this.#policyDecisions.values()],
    })
  }

  #useLinkageValid(use: AuthorityUse): boolean {
    const mandate = this.#mandates.get(use.spendingPolicyRef)
    return mandate !== undefined
      && use.spendingPolicyVersion === mandate.version
      && use.spendingPolicyGeneration <= mandate.generation
      && allowedActions(mandate).some((action) =>
        use.action.id === action.id && use.action.version === action.version)
  }

  #validateScope(
    input: AuthorityUseMaterial,
    now: string,
    excludeUseRef?: string,
  ): SpendingPolicyRefusalCode | undefined {
    const mandate = this.#mandates.get(input.spendingPolicyRef)
    if (mandate === undefined) return 'spending_policy_not_found'
    if (!spendingPolicyIntegrityValid(mandate)) return 'spending_policy_integrity_invalid'
    if (mandate.mode === 'unrestricted_test_only' && !this.#policyUseLinkageValid(input)) {
      return 'authority_use_linkage_invalid'
    }
    if (mandate.revoked !== false) return 'spending_policy_revoked'
    if (Date.parse(now) < Date.parse(mandate.scope.startsAt)) return 'spending_policy_not_started'
    if (Date.parse(now) >= Date.parse(mandate.scope.expiresAt)) return 'spending_policy_expired'
    if (input.spendingPolicyVersion !== mandate.version || input.spendingPolicyGeneration !== mandate.generation) {
      return 'spending_policy_generation_stale'
    }
    if (input.principalRef !== mandate.principalRef) return 'spending_policy_principal_mismatch'
    if (input.delegateRef !== mandate.delegateRef) return 'spending_policy_delegate_mismatch'
    if (input.callerRef !== mandate.callerRef) return 'spending_policy_caller_mismatch'
    if (!allowedActions(mandate).some((action) =>
      input.action.id === action.id && input.action.version === action.version)) {
      return 'spending_policy_action_mismatch'
    }
    if (!mandate.scope.providerRefs.includes(input.providerRef)) return 'spending_policy_provider_mismatch'
    if (!mandate.scope.recipientRefs.includes(input.recipientRef)) return 'spending_policy_recipient_mismatch'
    if (!mandate.scope.purposes.includes(input.purpose)) return 'spending_policy_purpose_mismatch'
    const allowedDataFields = new Set(mandate.scope.allowedDataFields)
    if (input.dataFields.some((field) => !allowedDataFields.has(field))) {
      return 'spending_policy_data_widening'
    }
    if (!sameExactScale(input.reservedSpend, mandate.scope.maximumSpend)
      || compareExactAmounts(input.reservedSpend, mandate.scope.maximumSpend) === undefined) {
      return 'spending_policy_currency_mismatch'
    }
    const lossCeiling = mandate.scope.maximumLoss ?? mandate.scope.maximumSpend
    if (input.reservedLoss !== undefined
      && (!sameExactScale(input.reservedLoss, lossCeiling)
        || compareExactAmounts(input.reservedLoss, lossCeiling) === undefined)) {
      return 'spending_policy_currency_mismatch'
    }
    if (!mandate.scope.permittedFallbacks.includes(input.fallbackRef ?? 'none')) return 'spending_policy_fallback_mismatch'
    if (input.risk !== mandate.scope.riskCeiling) return 'spending_policy_risk_exceeded'
    const uses = [...this.#uses.values()].filter((use) =>
      use.spendingPolicyRef === mandate.spendingPolicyRef && use.authorityUseRef !== excludeUseRef)
    const held = uses.filter((use) => use.state === 'reserved' || use.state === 'uncertain')
    const consumed = uses.filter((use) => use.state === 'released' || use.state === 'uncertain')
    if (consumed.length + held.filter((use) => use.state === 'reserved').length >= mandate.scope.maximumActionCount) {
      return 'spending_policy_count_exhausted'
    }
    const concurrentEffectCapacity = mandate.scope.maximumConcurrentReservations
    if (held.length >= concurrentEffectCapacity) return 'spending_policy_concurrency_exhausted'
    const committedSpend = sumExactAmounts(
      uses
        .filter((use) => use.state !== 'not_released')
        .map((use) => use.reservedSpend),
      mandate.scope.maximumSpend,
    )
    const committedSpendWithInput = committedSpend === undefined
      ? undefined
      : addExactAmounts(committedSpend, input.reservedSpend)
    if (committedSpendWithInput === undefined) return 'spending_policy_material_invalid'
    const spendComparison = compareExactAmounts(committedSpendWithInput, mandate.scope.maximumSpend)
    if (spendComparison === undefined) return 'spending_policy_material_invalid'
    if (spendComparison > 0) return 'spending_policy_spend_exceeded'
    const maximumLoss = mandate.scope.maximumLoss
    if (maximumLoss !== undefined) {
      const heldLossAmounts = uses
        .filter((use) => use.state !== 'not_released')
        .map((use) => effectiveLossAmount(use, this.#exposureOffsets.get(use.authorityUseRef)?.amount))
      const validHeldLossAmounts = heldLossAmounts.filter((amount): amount is ExactAmount => amount !== undefined)
      const heldLoss = validHeldLossAmounts.length !== heldLossAmounts.length
        ? undefined
        : sumExactAmounts(validHeldLossAmounts, maximumLoss)
      if (heldLoss === undefined || input.reservedLoss === undefined) {
        return 'spending_policy_material_invalid'
      }
      const heldLossWithInput = addExactAmounts(heldLoss, input.reservedLoss)
      if (heldLossWithInput === undefined) return 'spending_policy_material_invalid'
      const lossComparison = compareExactAmounts(heldLossWithInput, maximumLoss)
      if (lossComparison === undefined) return 'spending_policy_material_invalid'
      if (lossComparison > 0) return 'spending_policy_risk_exceeded'
    }
    return undefined
  }

  #policyUseLinkageValid(input: AuthorityUseMaterial): boolean {
    const decision = input.policyDecisionRef === undefined
      ? undefined
      : this.#policyDecisions.get(input.policyDecisionRef)
    return decision !== undefined
      && decision.proposal.authorityUseRef === input.authorityUseRef
      && decision.proposal.executionRef === input.executionRef
      && decision.proposal.action.id === input.action.id
      && decision.proposal.action.version === input.action.version
      && decision.proposal.materialDigest === input.preparedMaterialDigest
      && decision.proposal.providerRef === input.providerRef
      && decision.proposal.recipientRef === input.recipientRef
      && decision.proposal.purpose === input.purpose
      && canonicalDigest(decision.proposal.dataFields as never) === canonicalDigest(input.dataFields as never)
      && sameExactScale(decision.proposal.spend, input.reservedSpend)
      && compareExactAmounts(decision.proposal.spend, input.reservedSpend) === 0
      && input.reservedLoss !== undefined
      && sameExactScale(decision.proposal.worstCaseLoss, input.reservedLoss)
      && compareExactAmounts(decision.proposal.worstCaseLoss, input.reservedLoss) === 0
      && decision.proposal.fallbackRef === (input.fallbackRef ?? 'none')
      && decision.proposal.risk === input.risk
  }

  #offsetRuleAllowed(
    identity: ExposureOffsetRuleIdentity | Pick<AuthorityExposureOffset,
      'evidenceRuleRef' | 'evidenceRuleSource' | 'evidenceRuleVersion'>,
    spendingPolicyRef: string,
  ) {
    const source = 'source' in identity ? identity.source : identity.evidenceRuleSource
    const version = 'version' in identity ? identity.version : identity.evidenceRuleVersion
    return this.#mandates.get(spendingPolicyRef)?.scope.exposureOffsetRules?.some((allowed) =>
      allowed.evidenceRuleRef === identity.evidenceRuleRef
      && allowed.source === source
      && allowed.version === version) === true
  }

  #offsetAttestationValid(offset: Omit<AuthorityExposureOffset, 'digest'> | AuthorityExposureOffset) {
    const mandate = this.#mandates.get(offset.spendingPolicyRef)
    const attested = offset.releaseAttestation.material
    return mandate !== undefined
      && verifyExposureReleaseAttestation(
        offset.releaseAttestation,
        mandate.scope.exposureOffsetVerificationKeys ?? [],
      )
      && attested.evidenceRule.evidenceRuleRef === offset.evidenceRuleRef
      && attested.evidenceRule.source === offset.evidenceRuleSource
      && attested.evidenceRule.version === offset.evidenceRuleVersion
      && attested.providerRef === offset.providerRef
      && attested.originalEffect.action.id === offset.exposureAction.id
      && attested.originalEffect.action.version === offset.exposureAction.version
      && attested.originalEffect.subjectRef === offset.exposureSubjectRef
      && attested.originalEffect.resultRef === offset.exposureResultRef
      && attested.originalEffect.evidenceDigest === canonicalDigest(offset.exposureEvidenceRef as never)
      && attested.cancellationEffect.action.id === offset.offsetAction.id
      && attested.cancellationEffect.action.version === offset.offsetAction.version
      && attested.cancellationEffect.subjectRef === offset.offsetSubjectRef
      && attested.cancellationEffect.resultRef === offset.offsetResultRef
      && attested.cancellationEffect.evidenceDigest === canonicalDigest(offset.offsetEvidenceRef as never)
      && attested.outcome === 'provider_confirmed_reversal'
      && sameExactScale(attested.reversedAmount, offset.amount)
      && compareExactAmounts(attested.reversedAmount, offset.amount) === 0
  }
}

function effectiveLossAmount(
  use: Pick<AuthorityUse, 'reservedLoss' | 'reservedSpend'>,
  offset: ExactAmount | undefined,
): ExactAmount | undefined {
  const gross = use.reservedLoss ?? use.reservedSpend
  if (offset === undefined) return gross
  if (!sameExactScale(gross, offset)) return undefined
  return subtractExactAmounts(gross, offset)
}
function allowedActions(mandate: SpendingPolicy) {
  return mandate.scope.actions ?? [mandate.scope.action]
}
