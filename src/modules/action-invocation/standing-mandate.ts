import { canonicalDigest } from '@/modules/common/canonical-digest'

export const STANDING_MANDATE_FORMAT = 'ae.action-invocation-standing-mandate:v1' as const

export type StandingMandateScope = Readonly<{
  objective: string
  action: Readonly<{ id: string; version: string }>
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
}>

export type StandingMandate = Readonly<{
  format: typeof STANDING_MANDATE_FORMAT
  mode: 'bounded_mandate'
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
  fallbackRef: string | null
  risk: string
  effectGeneration: number
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
  uses: readonly AuthorityUse[]
}>

export type MandateRefusalCode =
  | 'mandate_not_found'
  | 'mandate_integrity_invalid'
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

export function issueStandingMandate(input: Omit<StandingMandate, 'format' | 'mode' | 'revoked' | 'digest'>): StandingMandate {
  assertMandateInput(input)
  const material = {
    ...input,
    format: STANDING_MANDATE_FORMAT,
    mode: 'bounded_mandate' as const,
    revoked: false as const,
  }
  return deepFreeze({ ...material, digest: canonicalDigest(material as never) })
}

export class StandingMandateStore {
  readonly #mandates = new Map<string, StandingMandate>()
  readonly #uses = new Map<string, AuthorityUse>()

  constructor(snapshot?: StandingMandateSnapshot) {
    for (const mandate of snapshot?.mandates ?? []) {
      if (!mandateIntegrityValid(mandate)) throw new Error('standing_mandate_snapshot_integrity_refused')
      this.#mandates.set(mandate.mandateRef, deepFreeze(structuredClone(mandate)))
    }
    for (const use of snapshot?.uses ?? []) {
      if (!authorityUseIntegrityValid(use) || !this.#useLinkageValid(use)) {
        throw new Error('standing_mandate_snapshot_authority_use_refused')
      }
      this.#uses.set(use.authorityUseRef, deepFreeze(structuredClone(use)))
    }
  }

  issue(mandate: StandingMandate): MandateDecision<StandingMandate> {
    if (!mandateIntegrityValid(mandate)) return { kind: 'refused', code: 'mandate_integrity_invalid' }
    const prior = this.#mandates.get(mandate.mandateRef)
    if (prior !== undefined) {
      return prior.digest === mandate.digest
        ? { kind: 'accepted', value: prior }
        : { kind: 'refused', code: 'authority_use_conflict' }
    }
    this.#mandates.set(mandate.mandateRef, mandate)
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

  recheckBeforeRelease(authorityUseRef: string, now: string): MandateDecision<AuthorityUse> {
    const use = this.#uses.get(authorityUseRef)
    if (use === undefined) return { kind: 'refused', code: 'authority_use_not_found' }
    if (use.state !== 'reserved') return { kind: 'refused', code: 'authority_use_linkage_invalid' }
    const validation = this.#validateScope(use, now, authorityUseRef)
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
    if (use.state !== 'reserved' && !(use.state === 'uncertain' && state === 'released')) {
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
  inspectUse(authorityUseRef: string) { return this.#uses.get(authorityUseRef) }

  capacity(mandateRef: string) {
    const mandate = this.#mandates.get(mandateRef)
    const uses = [...this.#uses.values()].filter((use) => use.mandateRef === mandateRef)
    const consumed = uses.filter((use) => use.state === 'released' || use.state === 'uncertain')
    const active = uses.filter((use) => use.state === 'reserved' || use.state === 'uncertain')
    return {
      maximumActionCount: mandate?.scope.maximumActionCount ?? 0,
      consumedCount: consumed.length,
      reservedCount: active.length,
      consumedSpendMinor: consumed.reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0),
      reservedSpendMinor: active.reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0),
    }
  }

  exportSnapshot(): StandingMandateSnapshot {
    return deepFreeze({
      format: 'ae.action-invocation-standing-mandate-store:v1',
      mandates: [...this.#mandates.values()],
      uses: [...this.#uses.values()],
    })
  }

  #useLinkageValid(use: AuthorityUse): boolean {
    const mandate = this.#mandates.get(use.mandateRef)
    return mandate !== undefined
      && use.mandateVersion === mandate.version
      && use.mandateGeneration <= mandate.generation
      && use.action.id === mandate.scope.action.id
      && use.action.version === mandate.scope.action.version
  }

  #validateScope(
    input: AuthorityUseMaterial,
    now: string,
    excludeUseRef?: string,
  ): MandateRefusalCode | undefined {
    const mandate = this.#mandates.get(input.mandateRef)
    if (mandate === undefined) return 'mandate_not_found'
    if (!mandateIntegrityValid(mandate)) return 'mandate_integrity_invalid'
    if (mandate.revoked !== false) return 'mandate_revoked'
    if (Date.parse(now) < Date.parse(mandate.scope.startsAt)) return 'mandate_not_started'
    if (Date.parse(now) >= Date.parse(mandate.scope.expiresAt)) return 'mandate_expired'
    if (input.mandateVersion !== mandate.version || input.mandateGeneration !== mandate.generation) {
      return 'mandate_generation_stale'
    }
    if (input.principalRef !== mandate.principalRef) return 'mandate_principal_mismatch'
    if (input.delegateRef !== mandate.delegateRef) return 'mandate_delegate_mismatch'
    if (input.callerRef !== mandate.callerRef) return 'mandate_caller_mismatch'
    if (input.action.id !== mandate.scope.action.id || input.action.version !== mandate.scope.action.version) {
      return 'mandate_action_mismatch'
    }
    if (!mandate.scope.providerRefs.includes(input.providerRef)) return 'mandate_provider_mismatch'
    if (!mandate.scope.recipientRefs.includes(input.recipientRef)) return 'mandate_recipient_mismatch'
    if (!mandate.scope.purposes.includes(input.purpose)) return 'mandate_purpose_mismatch'
    if (input.dataFields.some((field) => !mandate.scope.allowedDataFields.includes(field))) {
      return 'mandate_data_widening'
    }
    if (input.reservedSpend.currency !== mandate.scope.maximumSpend.currency) return 'mandate_currency_mismatch'
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
    return undefined
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

function assertMandateInput(input: Omit<StandingMandate, 'format' | 'mode' | 'revoked' | 'digest'>) {
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
  ) throw new Error('standing_mandate_material_invalid')
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
