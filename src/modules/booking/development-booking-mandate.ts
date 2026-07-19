import {
  StandingMandateStore,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type AuthorityUse,
  type MandateDecision,
  type MandateRefusalCode,
  type StandingMandateAuthorityBasis,
} from '@/modules/action-invocation'
import type { DevelopmentBookingInput, DevelopmentBookingResult } from './development-booking.actions'

export type DevelopmentBookingReleaseToken = Readonly<{
  authorityUseRef: string
  invocationRef: string
  basis: StandingMandateAuthorityBasis
  action: Readonly<{ id: string; version: string }>
  preparedMaterialDigest: string
  actor: Readonly<{ callerRef: string; principalRef: string }>
  delegateRef: string
  effectGeneration: number
}>

export function createDevelopmentBookingMandateService(input: Readonly<{
  store: StandingMandateStore
  authenticatedDelegate: Readonly<{ delegateRef: string; callerRef: string; principalRef: string }>
  now: () => string
}>) {
  const tokens = new Map<string, DevelopmentBookingReleaseToken>()

  return {
    reserveAndAuthorize(args: Readonly<{
      mandateRef: string
      authorityUseRef: string
      view: ActionInvocationView<DevelopmentBookingResult>
      origin: ActionInvocationOrigin
      booking: DevelopmentBookingInput
      effectGeneration: number
    }>): MandateDecision<Readonly<{ use: AuthorityUse; basis: StandingMandateAuthorityBasis }>> {
      const mandate = input.store.inspectMandate(args.mandateRef)
      const grant = input.store.inspectGrant(args.mandateRef)
      if (mandate === undefined || grant === undefined) return { kind: 'refused', code: 'mandate_not_found' }
      if (
        args.view.prepared === undefined
        || args.view.owner.callerRef !== input.authenticatedDelegate.callerRef
        || args.view.owner.principalRef !== input.authenticatedDelegate.principalRef
        || mandate.delegateRef !== input.authenticatedDelegate.delegateRef
        || mandate.callerRef !== input.authenticatedDelegate.callerRef
        || mandate.principalRef !== input.authenticatedDelegate.principalRef
        || args.booking.customer.principalRef !== args.view.owner.principalRef
      ) return { kind: 'refused', code: 'mandate_principal_mismatch' }
      const reserved = input.store.reserve({
        authorityUseRef: args.authorityUseRef,
        mandateRef: mandate.mandateRef,
        mandateVersion: mandate.version,
        mandateGeneration: mandate.generation,
        callerRef: args.view.owner.callerRef,
        principalRef: args.view.owner.principalRef,
        delegateRef: input.authenticatedDelegate.delegateRef,
        invocationRef: args.view.invocationRef,
        action: { id: args.view.action.id, version: args.view.action.contractVersion },
        preparedMaterialDigest: args.view.prepared.materialInputDigest,
        providerRef: args.booking.slot.providerRef,
        recipientRef: args.booking.disclosure.recipient,
        purpose: args.booking.disclosure.purpose,
        dataFields: args.booking.disclosure.fields,
        reservedSpend: { amountMinor: 0, currency: mandate.scope.maximumSpend.currency },
        fallbackRef: null,
        risk: 'development_booking_zero_charge',
        effectGeneration: args.effectGeneration,
      }, input.now())
      if (reserved.kind === 'refused') return reserved
      const basis: StandingMandateAuthorityBasis = {
        kind: 'standing_mandate_use',
        mandateRef: mandate.mandateRef,
        mandateVersion: mandate.version,
        mandateGeneration: mandate.generation,
        authorityUseRef: reserved.value.authorityUseRef,
        grantEvidenceRef: grant.evidenceRef,
      }
      tokens.set(reserved.value.authorityUseRef, {
        authorityUseRef: reserved.value.authorityUseRef,
        invocationRef: args.view.invocationRef,
        basis,
        action: reserved.value.action,
        preparedMaterialDigest: reserved.value.preparedMaterialDigest,
        actor: args.view.owner,
        delegateRef: reserved.value.delegateRef,
        effectGeneration: args.effectGeneration,
      })
      return { kind: 'accepted', value: { use: reserved.value, basis } }
    },

    recheckRelease(args: Readonly<{
      authorityUseRef: string
      view: ActionInvocationView<DevelopmentBookingResult>
      effectGeneration: number
    }>): MandateDecision<AuthorityUse> {
      const token = tokens.get(args.authorityUseRef)
      const basis = args.view.acceptedAuthority
      if (
        token === undefined
        || basis?.kind !== 'standing_mandate_use'
        || token.invocationRef !== args.view.invocationRef
        || token.effectGeneration !== args.effectGeneration
        || token.action.id !== args.view.action.id
        || token.action.version !== args.view.action.contractVersion
        || token.preparedMaterialDigest !== args.view.prepared?.materialInputDigest
        || token.actor.callerRef !== args.view.owner.callerRef
        || token.actor.principalRef !== args.view.owner.principalRef
        || token.basis.authorityUseRef !== basis.authorityUseRef
        || token.basis.mandateGeneration !== basis.mandateGeneration
        || token.basis.grantEvidenceRef !== basis.grantEvidenceRef
      ) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
      return input.store.recheckBeforeRelease({
        ...token,
        acceptedBasis: basis,
      }, input.now())
    },

    settleFromInvocation(args: Readonly<{
      authorityUseRef: string
      view: ActionInvocationView<DevelopmentBookingResult>
    }>): MandateDecision<AuthorityUse> {
      const attempt = args.view.attempts.find((candidate) =>
        candidate.effectGeneration === tokens.get(args.authorityUseRef)?.effectGeneration)
      if (attempt === undefined) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
      const state = attempt.release.state === 'released'
        || attempt.outcome.state === 'reconciled_released'
        ? 'released'
        : attempt.release.state === 'not_released'
          || attempt.outcome.state === 'reconciled_not_released'
          ? 'not_released'
          : 'uncertain'
      return input.store.settle(args.authorityUseRef, state, input.now())
    },
  }
}

export type DevelopmentBookingMandateService = ReturnType<typeof createDevelopmentBookingMandateService>

export function mandateRefusalToInvocationRefusal(_code: MandateRefusalCode) {
  return 'authority_not_accepted' as const
}
