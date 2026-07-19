import {
  StandingMandateStore,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type AuthorityUse,
  type MandateDecision,
  type MandateRefusalCode,
  type StandingMandateAuthorityBasis,
} from '@/modules/action-invocation'
import type {
  DevelopmentProviderOperationCancellationResult,
  DevelopmentProviderOperationInput,
  DevelopmentProviderOperationResult,
} from './development-provider-operation.actions'

type ProviderOperationEffectResult = DevelopmentProviderOperationResult | DevelopmentProviderOperationCancellationResult

export type DevelopmentProviderOperationReleaseToken = Readonly<{
  authorityUseRef: string
  invocationRef: string
  basis: StandingMandateAuthorityBasis
  action: Readonly<{ id: string; version: string }>
  preparedMaterialDigest: string
  actor: Readonly<{ callerRef: string; principalRef: string }>
  delegateRef: string
  effectGeneration: number
}>

export function createDevelopmentProviderOperationMandateService(input: Readonly<{
  store: StandingMandateStore
  authenticatedDelegate: Readonly<{ delegateRef: string; callerRef: string; principalRef: string }>
  now: () => string
}>) {
  return {
    compensateNotReleased(authorityUseRef: string): MandateDecision<AuthorityUse> {
      return input.store.settle(authorityUseRef, 'not_released', input.now())
    },

    settleExecutionException(args: Readonly<{
      authorityUseRef: string
      view: ActionInvocationView<ProviderOperationEffectResult> | undefined
      attemptRef: string
      releaseSignalObserved: boolean
    }>): MandateDecision<AuthorityUse> {
      const use = input.store.inspectUse(args.authorityUseRef)
      if (use === undefined) return { kind: 'refused', code: 'authority_use_not_found' }
      const attempt = args.view?.attempts.find((candidate) =>
        candidate.attemptRef === args.attemptRef
        && candidate.effectGeneration === use.effectGeneration)
      if (args.view !== undefined) {
        const token = reconstructReleaseToken(
          input.store,
          args.authorityUseRef,
          args.view,
          use.effectGeneration,
        )
        if (token.kind === 'refused') return token
      }
      const positivelyNotReleased = !args.releaseSignalObserved
        && attempt?.release.state === 'not_released'
      return input.store.settle(
        args.authorityUseRef,
        positivelyNotReleased ? 'not_released' : 'uncertain',
        input.now(),
      )
    },

    reserveAndAuthorize(args: Readonly<{
      mandateRef: string
      authorityUseRef: string
      view: ActionInvocationView<DevelopmentProviderOperationResult>
      origin: ActionInvocationOrigin
      operation: DevelopmentProviderOperationInput
      effectGeneration: number
      fallbackRef?: string | null
      reservedSpendMinor?: number
      reservedLossMinor?: number
      risk?: string
      policyDecisionRef?: string
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
        || args.operation.customer.principalRef !== args.view.owner.principalRef
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
        providerRef: args.operation.slot.providerRef,
        recipientRef: args.operation.disclosure.recipient,
        purpose: args.operation.disclosure.purpose,
        dataFields: args.operation.disclosure.fields,
        reservedSpend: {
          amountMinor: args.reservedSpendMinor ?? 0,
          currency: mandate.scope.maximumSpend.currency,
        },
        ...(args.reservedLossMinor === undefined ? {} : {
          reservedLoss: {
            amountMinor: args.reservedLossMinor,
            currency: mandate.scope.maximumLoss?.currency ?? mandate.scope.maximumSpend.currency,
          },
        }),
        fallbackRef: args.fallbackRef ?? null,
        risk: args.risk ?? 'development_provider_operation_zero_charge',
        effectGeneration: args.effectGeneration,
        ...(args.policyDecisionRef === undefined ? {} : { policyDecisionRef: args.policyDecisionRef }),
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
      return { kind: 'accepted', value: { use: reserved.value, basis } }
    },

    reserveCancellationAndAuthorize(args: Readonly<{
      mandateRef: string
      authorityUseRef: string
      actor: Readonly<{ callerRef: string; principalRef: string }>
      providerRef: string
      recipientRef: string
      purpose: string
      dataFields: readonly string[]
      preparedMaterialDigest: string
      invocationRef: string
      action: Readonly<{ id: string; version: string }>
      effectGeneration: number
      risk: string
      policyDecisionRef?: string
    }>): MandateDecision<Readonly<{ use: AuthorityUse; basis: StandingMandateAuthorityBasis }>> {
      const mandate = input.store.inspectMandate(args.mandateRef)
      const grant = input.store.inspectGrant(args.mandateRef)
      if (mandate === undefined || grant === undefined) return { kind: 'refused', code: 'mandate_not_found' }
      const reserved = input.store.reserve({
        authorityUseRef: args.authorityUseRef,
        mandateRef: mandate.mandateRef,
        mandateVersion: mandate.version,
        mandateGeneration: mandate.generation,
        callerRef: args.actor.callerRef,
        principalRef: args.actor.principalRef,
        delegateRef: input.authenticatedDelegate.delegateRef,
        invocationRef: args.invocationRef,
        action: args.action,
        preparedMaterialDigest: args.preparedMaterialDigest,
        providerRef: args.providerRef,
        recipientRef: args.recipientRef,
        purpose: args.purpose,
        dataFields: args.dataFields,
        reservedSpend: { amountMinor: 0, currency: mandate.scope.maximumSpend.currency },
        reservedLoss: {
          amountMinor: 0,
          currency: mandate.scope.maximumLoss?.currency ?? mandate.scope.maximumSpend.currency,
        },
        fallbackRef: null,
        risk: args.risk,
        effectGeneration: args.effectGeneration,
        ...(args.policyDecisionRef === undefined ? {} : { policyDecisionRef: args.policyDecisionRef }),
      }, input.now())
      if (reserved.kind === 'refused') return reserved
      return {
        kind: 'accepted',
        value: {
          use: reserved.value,
          basis: {
            kind: 'standing_mandate_use',
            mandateRef: mandate.mandateRef,
            mandateVersion: mandate.version,
            mandateGeneration: mandate.generation,
            authorityUseRef: reserved.value.authorityUseRef,
            grantEvidenceRef: grant.evidenceRef,
          },
        },
      }
    },

    recheckRelease<Result extends ProviderOperationEffectResult>(args: Readonly<{
      authorityUseRef: string
      view: ActionInvocationView<Result>
      effectGeneration: number
    }>): MandateDecision<AuthorityUse> {
      const token = reconstructReleaseToken(input.store, args.authorityUseRef, args.view, args.effectGeneration)
      if (token.kind === 'refused') return token
      return input.store.recheckBeforeRelease({
        ...token.value,
        acceptedBasis: token.value.basis,
      }, input.now())
    },

    settleFromInvocation<Result extends ProviderOperationEffectResult>(args: Readonly<{
      authorityUseRef: string
      view: ActionInvocationView<Result>
      attemptRef: string
    }>): MandateDecision<AuthorityUse> {
      const use = input.store.inspectUse(args.authorityUseRef)
      if (use === undefined) return { kind: 'refused', code: 'authority_use_not_found' }
      const token = reconstructReleaseToken(input.store, args.authorityUseRef, args.view, use.effectGeneration)
      if (token.kind === 'refused') return token
      const matching = args.view.attempts.filter((candidate) =>
        candidate.attemptRef === args.attemptRef
        && candidate.effectGeneration === use.effectGeneration
        && candidate.actor.callerRef === token.value.actor.callerRef
        && candidate.actor.principalRef === token.value.actor.principalRef
        && candidate.idempotency.materialInputDigest === token.value.preparedMaterialDigest)
      if (matching.length !== 1) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
      const attempt = matching[0]
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

export function reconstructReleaseToken<Result extends ProviderOperationEffectResult>(
  store: StandingMandateStore,
  authorityUseRef: string,
  view: ActionInvocationView<Result>,
  effectGeneration: number,
): MandateDecision<DevelopmentProviderOperationReleaseToken> {
  const use = store.inspectUse(authorityUseRef)
  const basis = view.acceptedAuthority
  const grant = use === undefined ? undefined : store.inspectGrant(use.mandateRef)
  if (
    use === undefined
    || grant === undefined
    || basis?.kind !== 'standing_mandate_use'
    || use.invocationRef !== view.invocationRef
    || use.effectGeneration !== effectGeneration
    || use.action.id !== view.action.id
    || use.action.version !== view.action.contractVersion
    || use.preparedMaterialDigest !== view.prepared?.materialInputDigest
    || use.callerRef !== view.owner.callerRef
    || use.principalRef !== view.owner.principalRef
    || basis.authorityUseRef !== use.authorityUseRef
    || basis.mandateRef !== use.mandateRef
    || basis.mandateVersion !== use.mandateVersion
    || basis.mandateGeneration !== use.mandateGeneration
    || basis.grantEvidenceRef !== grant.evidenceRef
  ) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
  return {
    kind: 'accepted',
    value: {
      authorityUseRef: use.authorityUseRef,
      invocationRef: use.invocationRef,
      basis,
      action: use.action,
      preparedMaterialDigest: use.preparedMaterialDigest,
      actor: { callerRef: use.callerRef, principalRef: use.principalRef },
      delegateRef: use.delegateRef,
      effectGeneration: use.effectGeneration,
    },
  }
}

export type DevelopmentProviderOperationMandateService = ReturnType<typeof createDevelopmentProviderOperationMandateService>

export function mandateRefusalToInvocationRefusal(_code: MandateRefusalCode) {
  return 'authority_not_accepted' as const
}
