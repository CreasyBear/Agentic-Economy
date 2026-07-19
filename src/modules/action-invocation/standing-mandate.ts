import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  verifiedGrantMatchesMandate,
  type VerifiedStandingMandateGrant,
} from './standing-mandate-grant'
import type { StandingMandateAuthorityBasis } from './contracts'
import type { StandingMandatePolicyDecision } from './standing-mandate-policy'
import {
  verifyExposureReleaseAttestation,
  type ExposureOffsetRuleIdentity,
  type ExposureReleaseAttestation,
} from './exposure-offset-rules'
import type { Ed25519VerificationKey } from '@/modules/common/ed25519-attestation'

export const STANDING_MANDATE_FORMAT = 'ae.action-invocation-standing-mandate:v1' as const

export type StandingMandateScope = Readonly<{
  objective: string
  action: Readonly<{ id: string; version: string }>
  actions?: readonly Readonly<{ id: string; version: string }>[]
  providerRefs: readonly string[]
  recipientRefs: readonly string[]
  purposes: readonly string[]
  allowedDataFields: readonly string[]
  maximumSpend: Readonly<{ amountMinor: number; currency: string }>
  maximumActionCount: number
  maximumConcurrentReservations: number
  startsAt: string
  expiresAt: string
  permittedFallbacks: readonly string[]
  riskCeiling: string
  maximumLoss?: Readonly<{ amountMinor: number; currency: string }>
  exposureOffsetRules?: readonly ExposureOffsetRuleIdentity[]
  exposureOffsetVerificationKeys?: readonly Ed25519VerificationKey[]
}>

export type StandingMandate = Readonly<{
  format: typeof STANDING_MANDATE_FORMAT
  mode: 'bounded_mandate' | 'full_yolo'
  mandateRef: string
  version: number
  generation: number
  grantorRef: string
  principalRef: string
  delegateRef: string
  callerRef: string
  scope: StandingMandateScope
  issuedAt: string
  revoked: false | Readonly<{ reason: string; revokedAt: string }>
  digest: string
}>

export type AuthorityUseMaterial = Readonly<{
  authorityUseRef: string
  mandateRef: string
  mandateVersion: number
  mandateGeneration: number
  callerRef: string
  principalRef: string
  delegateRef: string
  invocationRef: string
  action: Readonly<{ id: string; version: string }>
  preparedMaterialDigest: string
  providerRef: string
  recipientRef: string
  purpose: string
  dataFields: readonly string[]
  reservedSpend: Readonly<{ amountMinor: number; currency: string }>
  reservedLoss?: Readonly<{ amountMinor: number; currency: string }>
  fallbackRef: string | null
  risk: string
  effectGeneration: number
  policyDecisionRef?: string
}>

export type AuthorityUse = AuthorityUseMaterial & Readonly<{
  state: 'reserved' | 'not_released' | 'released' | 'uncertain'
  reservedAt: string
  settledAt?: string
  digest: string
}>

export type StandingMandateSnapshot = Readonly<{
  format: 'ae.action-invocation-standing-mandate-store:v1'
  mandates: readonly StandingMandate[]
  grants: readonly VerifiedStandingMandateGrant[]
  uses: readonly AuthorityUse[]
  exposureOffsets?: readonly AuthorityExposureOffset[]
  policyDecisions?: readonly StandingMandatePolicyDecision[]
}>

export type AuthorityExposureOffset = Readonly<{
  authorityUseRef: string
  offsetAuthorityUseRef: string
  mandateRef: string
  mandateVersion: number
  mandateGeneration: number
  principalRef: string
  providerRef: string
  exposureAction: Readonly<{ id: string; version: string }>
  offsetAction: Readonly<{ id: string; version: string }>
  exposureSubjectRef: string
  exposureResultRef: string
  exposureEvidenceRef: string
  offsetSubjectRef: string
  offsetResultRef: string
  offsetEvidenceRef: string
  amountMinor: number
  currency: string
  evidenceRuleRef: string
  evidenceRuleSource: string
  evidenceRuleVersion: string
  releaseAttestation: ExposureReleaseAttestation
  offsetGeneration: 1
  recordedAt: string
  digest: string
}>

export type MandateRefusalCode =
  | 'mandate_not_found'
  | 'mandate_integrity_invalid'
  | 'mandate_grant_unauthenticated'
  | 'mandate_revoked'
  | 'mandate_not_started'
  | 'mandate_expired'
  | 'mandate_generation_stale'
  | 'mandate_principal_mismatch'
  | 'mandate_delegate_mismatch'
  | 'mandate_caller_mismatch'
  | 'mandate_action_mismatch'
  | 'mandate_provider_mismatch'
  | 'mandate_recipient_mismatch'
  | 'mandate_purpose_mismatch'
  | 'mandate_data_widening'
  | 'mandate_spend_exceeded'
  | 'mandate_currency_mismatch'
  | 'mandate_count_exhausted'
  | 'mandate_concurrency_exhausted'
  | 'mandate_fallback_mismatch'
  | 'mandate_risk_exceeded'
  | 'authority_use_conflict'
  | 'authority_use_not_found'
  | 'authority_use_linkage_invalid'

export type MandateDecision<T> =
  | Readonly<{ kind: 'accepted'; value: T }>
  | Readonly<{ kind: 'refused'; code: MandateRefusalCode }>

export function issueStandingMandate(
  input: Omit<StandingMandate, 'format' | 'mode' | 'revoked' | 'digest'> & { mode?: StandingMandate['mode'] },
): StandingMandate {
  assertMandateInput(input)
  const { mode = 'bounded_mandate', ...rest } = input
  const material = {
    ...rest,
    format: STANDING_MANDATE_FORMAT,
    mode,
    revoked: false as const,
  }
  return deepFreeze({ ...material, digest: canonicalDigest(material as never) })
}

export class StandingMandateStore {
  readonly #mandates = new Map<string, StandingMandate>()
  readonly #uses = new Map<string, AuthorityUse>()
  readonly #grants = new Map<string, VerifiedStandingMandateGrant>()
  readonly #exposureOffsets = new Map<string, AuthorityExposureOffset>()
  readonly #policyDecisions = new Map<string, StandingMandatePolicyDecision>()
  readonly #usedOffsetUses = new Set<string>()
  readonly #usedOffsetEvidence = new Set<string>()
  constructor(snapshot?: StandingMandateSnapshot) {
    for (const mandate of snapshot?.mandates ?? []) {
      if (!mandateIntegrityValid(mandate)) throw new Error('standing_mandate_snapshot_integrity_refused')
      this.#mandates.set(mandate.mandateRef, deepFreeze(structuredClone(mandate)))
    }
    for (const grant of snapshot?.grants ?? []) {
      const mandate = this.#mandates.get(grant.mandateRef)
      if (mandate === undefined || !verifiedGrantMatchesMandate(grant, mandate, grant.verifiedAt)) {
        throw new Error('standing_mandate_snapshot_grant_refused')
      }
      this.#grants.set(grant.mandateRef, deepFreeze(structuredClone(grant)))
    }
    for (const use of snapshot?.uses ?? []) {
      if (!authorityUseIntegrityValid(use) || !this.#useLinkageValid(use)) {
        throw new Error('standing_mandate_snapshot_authority_use_refused')
      }
      this.#uses.set(use.authorityUseRef, deepFreeze(structuredClone(use)))
    }
    for (const decision of snapshot?.policyDecisions ?? []) {
      if (!policyDecisionIntegrityValid(decision)) {
        throw new Error('standing_mandate_snapshot_policy_decision_refused')
      }
      this.#policyDecisions.set(decision.policyDecisionRef, deepFreeze(structuredClone(decision)))
    }
    for (const use of this.#uses.values()) {
      const mandate = this.#mandates.get(use.mandateRef)
      if (mandate?.mode === 'full_yolo' && !this.#policyUseLinkageValid(use)) {
        throw new Error('standing_mandate_snapshot_policy_use_linkage_refused')
      }
    }
    for (const offset of snapshot?.exposureOffsets ?? []) {
      const { digest, ...material } = offset
      const use = this.#uses.get(offset.authorityUseRef)
      const offsetUse = this.#uses.get(offset.offsetAuthorityUseRef)
      if (
        digest !== canonicalDigest(material as never)
        || use === undefined
        || offsetUse === undefined
        || use.state !== 'released'
        || offset.mandateRef !== use.mandateRef
        || offset.mandateRef !== offsetUse.mandateRef
        || offset.mandateVersion !== use.mandateVersion
        || offset.mandateGeneration !== use.mandateGeneration
        || offset.principalRef !== use.principalRef
        || offset.principalRef !== offsetUse.principalRef
        || offset.providerRef !== use.providerRef
        || offset.providerRef !== offsetUse.providerRef
        || use.action.id !== offset.exposureAction.id
        || use.action.version !== offset.exposureAction.version
        || offsetUse.action.id !== offset.offsetAction.id
        || offsetUse.action.version !== offset.offsetAction.version
        || offsetUse.state !== 'released'
        || !this.#offsetRuleAllowed(offset, use.mandateRef)
        || !this.#offsetAttestationValid(offset)
        || offset.exposureSubjectRef !== offset.offsetSubjectRef
        || offset.offsetGeneration !== 1
        || this.#usedOffsetUses.has(offset.offsetAuthorityUseRef)
        || this.#usedOffsetEvidence.has(offset.offsetEvidenceRef)
        || offset.amountMinor < 0
        || offset.amountMinor > (use.reservedLoss?.amountMinor ?? use.reservedSpend.amountMinor)
      ) throw new Error('standing_mandate_snapshot_exposure_offset_refused')
      this.#exposureOffsets.set(offset.authorityUseRef, deepFreeze(structuredClone(offset)))
      this.#usedOffsetUses.add(offset.offsetAuthorityUseRef)
      this.#usedOffsetEvidence.add(offset.offsetEvidenceRef)
    }
  }

  issue(
    mandate: StandingMandate,
    admission: VerifiedStandingMandateGrant,
    now: string,
  ): MandateDecision<StandingMandate> {
    if (!mandateIntegrityValid(mandate)) return { kind: 'refused', code: 'mandate_integrity_invalid' }
    if (!verifiedGrantMatchesMandate(admission, mandate, now)) {
      return { kind: 'refused', code: 'mandate_grant_unauthenticated' }
    }
    const prior = this.#mandates.get(mandate.mandateRef)
    if (prior !== undefined) {
      return prior.digest === mandate.digest
        ? { kind: 'accepted', value: prior }
        : { kind: 'refused', code: 'authority_use_conflict' }
    }
    this.#mandates.set(mandate.mandateRef, mandate)
    this.#grants.set(mandate.mandateRef, admission)
    return { kind: 'accepted', value: mandate }
  }

  revoke(input: Readonly<{
    mandateRef: string
    expectedGeneration: number
    reason: string
    revokedAt: string
  }>): MandateDecision<StandingMandate> {
    const current = this.#mandates.get(input.mandateRef)
    if (current === undefined) return { kind: 'refused', code: 'mandate_not_found' }
    if (current.generation !== input.expectedGeneration) {
      return { kind: 'refused', code: 'mandate_generation_stale' }
    }
    const material = {
      ...current,
      generation: current.generation + 1,
      revoked: { reason: input.reason, revokedAt: input.revokedAt },
    }
    const { digest: _digest, ...withoutDigest } = material
    const revoked = deepFreeze({ ...withoutDigest, digest: canonicalDigest(withoutDigest as never) })
    this.#mandates.set(current.mandateRef, revoked)
    return { kind: 'accepted', value: revoked }
  }

  reserve(material: AuthorityUseMaterial, now: string): MandateDecision<AuthorityUse> {
    const prior = this.#uses.get(material.authorityUseRef)
    if (prior !== undefined) {
      const candidateDigest = canonicalDigest({ ...material, state: 'reserved', reservedAt: now } as never)
      return prior.digest === candidateDigest
        ? { kind: 'accepted', value: prior }
        : { kind: 'refused', code: 'authority_use_conflict' }
    }
    const validation = this.#validateScope(material, now)
    if (validation !== undefined) return { kind: 'refused', code: validation }
    const useMaterial = { ...material, state: 'reserved' as const, reservedAt: now }
    const use = deepFreeze({ ...useMaterial, digest: canonicalDigest(useMaterial as never) })
    this.#uses.set(use.authorityUseRef, use)
    return { kind: 'accepted', value: use }
  }

  acceptPolicyDecision(decision: StandingMandatePolicyDecision): MandateDecision<StandingMandatePolicyDecision> {
    if (!policyDecisionIntegrityValid(decision)) {
      return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    }
    const mandate = this.#mandates.get(decision.mandateRef)
    const currentCapacity = this.capacity(decision.mandateRef)
    const mandateUses = [...this.#uses.values()].filter((use) => use.mandateRef === decision.mandateRef)
    if (
      mandate?.mode !== 'full_yolo'
      || decision.mandateVersion !== mandate.version
      || decision.mandateGeneration !== mandate.generation
      || decision.proposal.objective !== mandate.scope.objective
      || decision.capacity.consumedCount !== currentCapacity.consumedCount
      || decision.capacity.reservedCount !== currentCapacity.reservedCount
      || decision.capacity.committedSpendMinor !== (
        currentCapacity.consumedSpendMinor + currentCapacity.reservedSpendMinor
      )
      || decision.capacity.heldWorstCaseLossMinor !== currentCapacity.worstCaseLossMinor
      || decision.heldWorstCaseLossMinor !== currentCapacity.worstCaseLossMinor
      || decision.proposal.spend.amountMinor + mandateUses
        .filter((use) => use.state !== 'not_released')
        .reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0)
        > mandate.scope.maximumSpend.amountMinor
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
    invocationRef: string
    acceptedBasis: StandingMandateAuthorityBasis
    action: Readonly<{ id: string; version: string }>
    preparedMaterialDigest: string
    actor: Readonly<{ callerRef: string; principalRef: string }>
    delegateRef: string
    effectGeneration: number
  }>, now: string): MandateDecision<AuthorityUse> {
    const use = this.#uses.get(token.authorityUseRef)
    if (use === undefined) return { kind: 'refused', code: 'authority_use_not_found' }
    if (use.state !== 'reserved') return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    if (
      use.invocationRef !== token.invocationRef
      || use.action.id !== token.action.id
      || use.action.version !== token.action.version
      || use.preparedMaterialDigest !== token.preparedMaterialDigest
      || use.callerRef !== token.actor.callerRef
      || use.principalRef !== token.actor.principalRef
      || use.delegateRef !== token.delegateRef
      || use.effectGeneration !== token.effectGeneration
      || token.acceptedBasis.authorityUseRef !== use.authorityUseRef
      || token.acceptedBasis.mandateRef !== use.mandateRef
      || token.acceptedBasis.mandateVersion !== use.mandateVersion
      || token.acceptedBasis.mandateGeneration !== use.mandateGeneration
      || token.acceptedBasis.grantEvidenceRef !== this.#grants.get(use.mandateRef)?.evidenceRef
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
  ): MandateDecision<AuthorityUse> {
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
    const settled = deepFreeze({ ...material, digest: canonicalDigest(material as never) })
    this.#uses.set(authorityUseRef, settled)
    return { kind: 'accepted', value: settled }
  }

  inspectMandate(mandateRef: string) { return this.#mandates.get(mandateRef) }
  inspectGrant(mandateRef: string) { return this.#grants.get(mandateRef) }
  inspectUse(authorityUseRef: string) { return this.#uses.get(authorityUseRef) }

  recordExposureOffset(
    input: Omit<AuthorityExposureOffset, 'digest'>,
  ): MandateDecision<AuthorityExposureOffset> {
    const use = this.#uses.get(input.authorityUseRef)
    const offsetUse = this.#uses.get(input.offsetAuthorityUseRef)
    if (
      use === undefined
      || offsetUse === undefined
      || use.state !== 'released'
      || offsetUse.state !== 'released'
      || input.mandateRef !== use.mandateRef
      || input.mandateRef !== offsetUse.mandateRef
      || input.mandateVersion !== use.mandateVersion
      || input.mandateGeneration !== use.mandateGeneration
      || input.principalRef !== use.principalRef
      || input.principalRef !== offsetUse.principalRef
      || input.providerRef !== use.providerRef
      || input.providerRef !== offsetUse.providerRef
      || input.exposureAction.id !== use.action.id
      || input.exposureAction.version !== use.action.version
      || offsetUse.action.id !== input.offsetAction.id
      || offsetUse.action.version !== input.offsetAction.version
      || !this.#offsetRuleAllowed(input, input.mandateRef)
      || !this.#offsetAttestationValid(input)
      || input.exposureSubjectRef !== input.offsetSubjectRef
      || input.exposureResultRef.length === 0
      || input.exposureEvidenceRef.length === 0
      || input.offsetResultRef.length === 0
      || input.offsetEvidenceRef.length === 0
      || input.offsetGeneration !== 1
      || this.#usedOffsetUses.has(input.offsetAuthorityUseRef)
      || this.#usedOffsetEvidence.has(input.offsetEvidenceRef)
      || input.currency !== (use.reservedLoss?.currency ?? use.reservedSpend.currency)
      || input.amountMinor < 0
      || input.amountMinor > (use.reservedLoss?.amountMinor ?? use.reservedSpend.amountMinor)
    ) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    const material = { ...input }
    const offset = deepFreeze({ ...material, digest: canonicalDigest(material as never) })
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

  capacity(mandateRef: string) {
    const mandate = this.#mandates.get(mandateRef)
    const uses = [...this.#uses.values()].filter((use) => use.mandateRef === mandateRef)
    const consumed = uses.filter((use) => use.state === 'released')
    const active = uses.filter((use) => use.state === 'reserved' || use.state === 'uncertain')
    return {
      maximumActionCount: mandate?.scope.maximumActionCount ?? 0,
      consumedCount: consumed.length,
      reservedCount: active.length,
      consumedSpendMinor: consumed.reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0),
      reservedSpendMinor: active.reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0),
      worstCaseLossMinor: uses
        .filter((use) => use.state !== 'not_released')
        .reduce((sum, use) =>
          sum + (use.reservedLoss?.amountMinor ?? use.reservedSpend.amountMinor)
          - (this.#exposureOffsets.get(use.authorityUseRef)?.amountMinor ?? 0), 0),
    }
  }

  exportSnapshot(): StandingMandateSnapshot {
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
    const mandate = this.#mandates.get(use.mandateRef)
    return mandate !== undefined
      && use.mandateVersion === mandate.version
      && use.mandateGeneration <= mandate.generation
      && allowedActions(mandate).some((action) =>
        use.action.id === action.id && use.action.version === action.version)
  }

  #validateScope(
    input: AuthorityUseMaterial,
    now: string,
    excludeUseRef?: string,
  ): MandateRefusalCode | undefined {
    const mandate = this.#mandates.get(input.mandateRef)
    if (mandate === undefined) return 'mandate_not_found'
    if (!mandateIntegrityValid(mandate)) return 'mandate_integrity_invalid'
    if (mandate.mode === 'full_yolo' && !this.#policyUseLinkageValid(input)) {
      return 'authority_use_linkage_invalid'
    }
    if (mandate.revoked !== false) return 'mandate_revoked'
    if (Date.parse(now) < Date.parse(mandate.scope.startsAt)) return 'mandate_not_started'
    if (Date.parse(now) >= Date.parse(mandate.scope.expiresAt)) return 'mandate_expired'
    if (input.mandateVersion !== mandate.version || input.mandateGeneration !== mandate.generation) {
      return 'mandate_generation_stale'
    }
    if (input.principalRef !== mandate.principalRef) return 'mandate_principal_mismatch'
    if (input.delegateRef !== mandate.delegateRef) return 'mandate_delegate_mismatch'
    if (input.callerRef !== mandate.callerRef) return 'mandate_caller_mismatch'
    if (!allowedActions(mandate).some((action) =>
      input.action.id === action.id && input.action.version === action.version)) {
      return 'mandate_action_mismatch'
    }
    if (!mandate.scope.providerRefs.includes(input.providerRef)) return 'mandate_provider_mismatch'
    if (!mandate.scope.recipientRefs.includes(input.recipientRef)) return 'mandate_recipient_mismatch'
    if (!mandate.scope.purposes.includes(input.purpose)) return 'mandate_purpose_mismatch'
    if (input.dataFields.some((field) => !mandate.scope.allowedDataFields.includes(field))) {
      return 'mandate_data_widening'
    }
    if (input.reservedSpend.currency !== mandate.scope.maximumSpend.currency) return 'mandate_currency_mismatch'
    if (
      input.reservedLoss !== undefined
      && input.reservedLoss.currency !== (mandate.scope.maximumLoss?.currency ?? mandate.scope.maximumSpend.currency)
    ) return 'mandate_currency_mismatch'
    if (!mandate.scope.permittedFallbacks.includes(input.fallbackRef ?? 'none')) return 'mandate_fallback_mismatch'
    if (input.risk !== mandate.scope.riskCeiling) return 'mandate_risk_exceeded'
    const uses = [...this.#uses.values()].filter((use) =>
      use.mandateRef === mandate.mandateRef && use.authorityUseRef !== excludeUseRef)
    const held = uses.filter((use) => use.state === 'reserved' || use.state === 'uncertain')
    const consumed = uses.filter((use) => use.state === 'released' || use.state === 'uncertain')
    if (consumed.length + held.filter((use) => use.state === 'reserved').length >= mandate.scope.maximumActionCount) {
      return 'mandate_count_exhausted'
    }
    if (held.length >= mandate.scope.maximumConcurrentReservations) return 'mandate_concurrency_exhausted'
    const committedSpend = uses
      .filter((use) => use.state !== 'not_released')
      .reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0)
    if (committedSpend + input.reservedSpend.amountMinor > mandate.scope.maximumSpend.amountMinor) {
      return 'mandate_spend_exceeded'
    }
    const maximumLoss = mandate.scope.maximumLoss
    if (maximumLoss !== undefined) {
      const heldLoss = uses
        .filter((use) => use.state !== 'not_released')
        .reduce((sum, use) =>
          sum + (use.reservedLoss?.amountMinor ?? use.reservedSpend.amountMinor)
          - (this.#exposureOffsets.get(use.authorityUseRef)?.amountMinor ?? 0), 0)
      if (input.reservedLoss === undefined || heldLoss + input.reservedLoss.amountMinor > maximumLoss.amountMinor) {
        return 'mandate_risk_exceeded'
      }
    }
    return undefined
  }

  #policyUseLinkageValid(input: AuthorityUseMaterial): boolean {
    const decision = input.policyDecisionRef === undefined
      ? undefined
      : this.#policyDecisions.get(input.policyDecisionRef)
    return decision !== undefined
      && decision.proposal.authorityUseRef === input.authorityUseRef
      && decision.proposal.invocationRef === input.invocationRef
      && decision.proposal.action.id === input.action.id
      && decision.proposal.action.version === input.action.version
      && decision.proposal.materialDigest === input.preparedMaterialDigest
      && decision.proposal.providerRef === input.providerRef
      && decision.proposal.recipientRef === input.recipientRef
      && decision.proposal.purpose === input.purpose
      && canonicalDigest(decision.proposal.dataFields as never) === canonicalDigest(input.dataFields as never)
      && decision.proposal.spend.amountMinor === input.reservedSpend.amountMinor
      && decision.proposal.spend.currency === input.reservedSpend.currency
      && decision.proposal.worstCaseLoss.amountMinor === input.reservedLoss?.amountMinor
      && decision.proposal.worstCaseLoss.currency === input.reservedLoss?.currency
      && decision.proposal.fallbackRef === (input.fallbackRef ?? 'none')
      && decision.proposal.risk === input.risk
  }

  #offsetRuleAllowed(
    identity: ExposureOffsetRuleIdentity | Pick<AuthorityExposureOffset,
      'evidenceRuleRef' | 'evidenceRuleSource' | 'evidenceRuleVersion'>,
    mandateRef: string,
  ) {
    const source = 'source' in identity ? identity.source : identity.evidenceRuleSource
    const version = 'version' in identity ? identity.version : identity.evidenceRuleVersion
    return this.#mandates.get(mandateRef)?.scope.exposureOffsetRules?.some((allowed) =>
      allowed.evidenceRuleRef === identity.evidenceRuleRef
      && allowed.source === source
      && allowed.version === version) === true
  }

  #offsetAttestationValid(offset: Omit<AuthorityExposureOffset, 'digest'> | AuthorityExposureOffset) {
    const mandate = this.#mandates.get(offset.mandateRef)
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
      && attested.reversedAmount.amountMinor === offset.amountMinor
      && attested.reversedAmount.currency === offset.currency
  }
}

export function mandateIntegrityValid(mandate: StandingMandate): boolean {
  const { digest, ...material } = mandate
  return digest === canonicalDigest(material as never)
}

export function authorityUseIntegrityValid(use: AuthorityUse): boolean {
  const { digest, ...material } = use
  return digest === canonicalDigest(material as never)
}

export function policyDecisionIntegrityValid(decision: StandingMandatePolicyDecision): boolean {
  const { digest, ...material } = decision
  return digest === canonicalDigest(material as never)
}

function assertMandateInput(
  input: Omit<StandingMandate, 'format' | 'mode' | 'revoked' | 'digest'> & { mode?: StandingMandate['mode'] },
) {
  const mode = input.mode ?? 'bounded_mandate'
  const actions = input.scope.actions ?? [input.scope.action]
  if (
    input.version < 1 || input.generation < 1
    || input.scope.maximumActionCount < 1
    || input.scope.maximumConcurrentReservations < 1
    || input.scope.maximumSpend.amountMinor < 0
    || Date.parse(input.scope.startsAt) >= Date.parse(input.scope.expiresAt)
    || input.scope.providerRefs.length === 0
    || input.scope.recipientRefs.length === 0
    || input.scope.purposes.length === 0
    || input.scope.allowedDataFields.length === 0
    || input.scope.permittedFallbacks.length === 0
    || actions.length === 0
    || actions.some((action) => action.id.length === 0 || action.version.length === 0)
    || new Set(actions.map((action) => `${action.id}:${action.version}`)).size !== actions.length
    || input.scope.exposureOffsetRules?.some((rule) =>
      rule.evidenceRuleRef.length === 0 || rule.source.length === 0 || rule.version.length === 0)
    || input.scope.exposureOffsetVerificationKeys?.some((key) =>
      key.keyId.length === 0 || !/^[0-9a-f]{64}$/.test(key.publicKey))
    || ((input.scope.exposureOffsetRules?.length ?? 0) > 0
      && (input.scope.exposureOffsetVerificationKeys?.length ?? 0) === 0)
    || (mode === 'bounded_mandate' && (
      actions.length !== 1
      || actions[0]?.id !== input.scope.action.id
      || actions[0]?.version !== input.scope.action.version
    ))
    || (mode === 'full_yolo' && (
      input.scope.actions === undefined
      || input.scope.maximumLoss === undefined
      || input.scope.maximumLoss.amountMinor < 0
      || input.scope.maximumLoss.currency !== input.scope.maximumSpend.currency
    ))
  ) throw new Error('standing_mandate_material_invalid')
}

function allowedActions(mandate: StandingMandate) {
  return mandate.scope.actions ?? [mandate.scope.action]
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
