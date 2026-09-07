import {
  SpendingPolicyStore,
  type ActionExecutionOrigin,
  type ActionExecutionView,
  type AuthorityUse,
  type SpendingPolicyResult,
  type SpendingPolicyRefusalCode,
  type SpendingPolicyAuthorityBasis,
} from '../../../../src/modules/action-execution'
import type { ExactAmount } from '../../../../src/modules/money/public'
import type {
  DevelopmentProviderToolCancellationResult,
  DevelopmentProviderToolInput,
  DevelopmentProviderToolResult,
} from './development-provider-tool.actions'

type ProviderToolEffectResult = DevelopmentProviderToolResult | DevelopmentProviderToolCancellationResult

export type DevelopmentProviderToolExecutionReleaseToken = Readonly<{
  authorityUseRef: string
  executionRef: string
  basis: SpendingPolicyAuthorityBasis
  action: Readonly<{ id: string; version: string }>
  preparedMaterialDigest: string
  actor: Readonly<{ callerRef: string; principalRef: string }>
  delegateRef: string
  effectGeneration: number
}>

export function createDevelopmentProviderToolSpendingPolicyService(input: Readonly<{
  store: SpendingPolicyStore
  authenticatedDelegate: Readonly<{ delegateRef: string; callerRef: string; principalRef: string }>
  now: () => string
}>) {
  return {
    compensateNotReleased(authorityUseRef: string): SpendingPolicyResult<AuthorityUse> {
      return input.store.settle(authorityUseRef, 'not_released', input.now())
    },

    settleExecutionException(args: Readonly<{
      authorityUseRef: string
      view: ActionExecutionView<ProviderToolEffectResult> | undefined
      attemptRef: string
      releaseSignalObserved: boolean
    }>): SpendingPolicyResult<AuthorityUse> {
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
      spendingPolicyRef: string
      authorityUseRef: string
      view: ActionExecutionView<DevelopmentProviderToolResult>
      origin: ActionExecutionOrigin
      operation: DevelopmentProviderToolInput
      effectGeneration: number
      fallbackRef?: string | null
      reservedSpend?: ExactAmount
      reservedLoss?: ExactAmount
      risk?: string
      policyDecisionRef?: string
    }>): SpendingPolicyResult<Readonly<{ use: AuthorityUse; basis: SpendingPolicyAuthorityBasis }>> {
      const spendingPolicy = input.store.inspectSpendingPolicy(args.spendingPolicyRef)
      const grant = input.store.inspectGrant(args.spendingPolicyRef)
      if (spendingPolicy === undefined || grant === undefined) return { kind: 'refused', code: 'spending_policy_not_found' }
      if (
        args.view.prepared === undefined
        || args.view.owner.callerRef !== input.authenticatedDelegate.callerRef
        || args.view.owner.principalRef !== input.authenticatedDelegate.principalRef
        || spendingPolicy.delegateRef !== input.authenticatedDelegate.delegateRef
        || spendingPolicy.callerRef !== input.authenticatedDelegate.callerRef
        || spendingPolicy.principalRef !== input.authenticatedDelegate.principalRef
        || args.operation.customer.principalRef !== args.view.owner.principalRef
      ) return { kind: 'refused', code: 'spending_policy_principal_mismatch' }
      const reserved = input.store.reserve({
        authorityUseRef: args.authorityUseRef,
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        spendingPolicyVersion: spendingPolicy.version,
        spendingPolicyGeneration: spendingPolicy.generation,
        callerRef: args.view.owner.callerRef,
        principalRef: args.view.owner.principalRef,
        delegateRef: input.authenticatedDelegate.delegateRef,
        executionRef: args.view.executionRef,
        action: { id: args.view.action.id, version: args.view.action.contractVersion },
        preparedMaterialDigest: args.view.prepared.materialInputDigest,
        providerRef: args.operation.slot.providerRef,
        recipientRef: args.operation.disclosure.recipient,
        purpose: args.operation.disclosure.purpose,
        dataFields: args.operation.disclosure.fields,
        reservedSpend: args.reservedSpend ?? {
          currency: spendingPolicy.scope.maximumSpend.currency,
          units: '0',
          exponent: spendingPolicy.scope.maximumSpend.exponent,
        },
        ...(args.reservedLoss === undefined ? {} : {
          reservedLoss: args.reservedLoss,
        }),
        fallbackRef: args.fallbackRef ?? null,
        risk: args.risk ?? 'development_provider_operation_zero_charge',
        effectGeneration: args.effectGeneration,
        ...(args.policyDecisionRef === undefined ? {} : { policyDecisionRef: args.policyDecisionRef }),
      }, input.now())
      if (reserved.kind === 'refused') return reserved
      const basis: SpendingPolicyAuthorityBasis = {
        kind: 'spending_policy_use',
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        spendingPolicyVersion: spendingPolicy.version,
        spendingPolicyGeneration: spendingPolicy.generation,
        authorityUseRef: reserved.value.authorityUseRef,
        grantEvidenceRef: grant.evidenceRef,
      }
      return { kind: 'accepted', value: { use: reserved.value, basis } }
    },

    reserveCancellationAndAuthorize(args: Readonly<{
      spendingPolicyRef: string
      authorityUseRef: string
      actor: Readonly<{ callerRef: string; principalRef: string }>
      providerRef: string
      recipientRef: string
      purpose: string
      dataFields: readonly string[]
      preparedMaterialDigest: string
      executionRef: string
      action: Readonly<{ id: string; version: string }>
      effectGeneration: number
      risk: string
      policyDecisionRef?: string
    }>): SpendingPolicyResult<Readonly<{ use: AuthorityUse; basis: SpendingPolicyAuthorityBasis }>> {
      const spendingPolicy = input.store.inspectSpendingPolicy(args.spendingPolicyRef)
      const grant = input.store.inspectGrant(args.spendingPolicyRef)
      if (spendingPolicy === undefined || grant === undefined) return { kind: 'refused', code: 'spending_policy_not_found' }
      const reserved = input.store.reserve({
        authorityUseRef: args.authorityUseRef,
        spendingPolicyRef: spendingPolicy.spendingPolicyRef,
        spendingPolicyVersion: spendingPolicy.version,
        spendingPolicyGeneration: spendingPolicy.generation,
        callerRef: args.actor.callerRef,
        principalRef: args.actor.principalRef,
        delegateRef: input.authenticatedDelegate.delegateRef,
        executionRef: args.executionRef,
        action: args.action,
        preparedMaterialDigest: args.preparedMaterialDigest,
        providerRef: args.providerRef,
        recipientRef: args.recipientRef,
        purpose: args.purpose,
        dataFields: args.dataFields,
        reservedSpend: {
          currency: spendingPolicy.scope.maximumSpend.currency,
          units: '0',
          exponent: spendingPolicy.scope.maximumSpend.exponent,
        },
        reservedLoss: {
          currency: spendingPolicy.scope.maximumLoss?.currency ?? spendingPolicy.scope.maximumSpend.currency,
          units: '0',
          exponent: spendingPolicy.scope.maximumLoss?.exponent ?? spendingPolicy.scope.maximumSpend.exponent,
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
            kind: 'spending_policy_use',
            spendingPolicyRef: spendingPolicy.spendingPolicyRef,
            spendingPolicyVersion: spendingPolicy.version,
            spendingPolicyGeneration: spendingPolicy.generation,
            authorityUseRef: reserved.value.authorityUseRef,
            grantEvidenceRef: grant.evidenceRef,
          },
        },
      }
    },

    recheckRelease<Result extends ProviderToolEffectResult>(args: Readonly<{
      authorityUseRef: string
      view: ActionExecutionView<Result>
      effectGeneration: number
    }>): SpendingPolicyResult<AuthorityUse> {
      const token = reconstructReleaseToken(input.store, args.authorityUseRef, args.view, args.effectGeneration)
      if (token.kind === 'refused') return token
      return input.store.recheckBeforeRelease({
        ...token.value,
        acceptedBasis: token.value.basis,
      }, input.now())
    },

    settleFromInvocation<Result extends ProviderToolEffectResult>(args: Readonly<{
      authorityUseRef: string
      view: ActionExecutionView<Result>
      attemptRef: string
    }>): SpendingPolicyResult<AuthorityUse> {
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

export function reconstructReleaseToken<Result extends ProviderToolEffectResult>(
  store: SpendingPolicyStore,
  authorityUseRef: string,
  view: ActionExecutionView<Result>,
  effectGeneration: number,
): SpendingPolicyResult<DevelopmentProviderToolExecutionReleaseToken> {
  const use = store.inspectUse(authorityUseRef)
  const basis = view.acceptedAuthority
  const grant = use === undefined ? undefined : store.inspectGrant(use.spendingPolicyRef)
  if (
    use === undefined
    || grant === undefined
    || basis?.kind !== 'spending_policy_use'
    || use.executionRef !== view.executionRef
    || use.effectGeneration !== effectGeneration
    || use.action.id !== view.action.id
    || use.action.version !== view.action.contractVersion
    || use.preparedMaterialDigest !== view.prepared?.materialInputDigest
    || use.callerRef !== view.owner.callerRef
    || use.principalRef !== view.owner.principalRef
    || basis.authorityUseRef !== use.authorityUseRef
    || basis.spendingPolicyRef !== use.spendingPolicyRef
    || basis.spendingPolicyVersion !== use.spendingPolicyVersion
    || basis.spendingPolicyGeneration !== use.spendingPolicyGeneration
    || basis.grantEvidenceRef !== grant.evidenceRef
  ) return { kind: 'refused', code: 'authority_use_linkage_invalid' }
  return {
    kind: 'accepted',
    value: {
      authorityUseRef: use.authorityUseRef,
      executionRef: use.executionRef,
      basis,
      action: use.action,
      preparedMaterialDigest: use.preparedMaterialDigest,
      actor: { callerRef: use.callerRef, principalRef: use.principalRef },
      delegateRef: use.delegateRef,
      effectGeneration: use.effectGeneration,
    },
  }
}

export type DevelopmentProviderToolSpendingPolicyService = ReturnType<typeof createDevelopmentProviderToolSpendingPolicyService>

export function spendingPolicyRefusalToExecutionRefusal(_code: SpendingPolicyRefusalCode) {
  return 'authority_not_accepted' as const
}
