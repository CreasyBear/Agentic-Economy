import type { DisclosureGrant, RootRunSnapshot, RouteAuthorization, RouteQuote, StepGrant } from './model'
import { createBudgetAuthority, reserveBudget, resolveBudgetReservation, type BudgetAuthority } from './budget-authority'
import { consumeDisclosureGrant, createDataAuthorizationBudget, resolveDisclosureAttempt as resolveDataAttempt, type DataAuthorizationBudget } from './data-authorization-budget'
import { isValidDisclosureGrant, sameDisclosureGrant } from './disclosure-grant'
import { isValidStepGrant, sameStepGrant } from './step-grant'

type Awaitable<Value> = Value | Promise<Value>

export type KernelStore = Readonly<{
  incidentRecoveryAuthority: 'none' | 'atomic'
  putQuote: (quote: RouteQuote) => Awaitable<void>
  getQuote: (quoteId: string) => Awaitable<RouteQuote | undefined>
  getQuoteByRoutingRequestId: (routingRequestId: string) => Awaitable<RouteQuote | undefined>
  putAuthorization: (authorization: RouteAuthorization) => Awaitable<void>
  getAuthorization: (authorizationRef: string) => Awaitable<RouteAuthorization | undefined>
  getBudgetAuthority: (budgetAuthorityRef: string) => Awaitable<BudgetAuthority | undefined>
  getDataAuthorizationBudget: (dataAuthorizationBudgetRef: string) => Awaitable<DataAuthorizationBudget | undefined>
  getRun: (rootRunId: string) => Awaitable<RootRunSnapshot | undefined>
  getExecution: (executionScope: string) => Awaitable<ExecutionState | undefined>
  claimExecution: (input: ClaimExecutionInput) => Awaitable<ClaimExecutionResult>
  completeExecution: (executionScope: string, run: RootRunSnapshot) => Awaitable<void>
  reconcileRun: (rootRunId: string, leafRunId: string, run: RootRunSnapshot) => Awaitable<'applied' | 'not_found' | 'not_unknown' | IncidentFrozenResult>
  requestCancellation: (rootRunId: string, caller: Readonly<{ agentId: string; principalId: string }>, requestedAt: number) => Awaitable<'requested' | 'not_found' | 'not_owner' | 'not_possible' | IncidentFrozenResult>
  authorizeProviderRelease: (input: StepReleaseInput) => Awaitable<StepReleaseResult>
  resolveDisclosureAttempt: (disclosureGrantId: string, disposition: 'not_released' | 'released', resolvedAt: number) => Awaitable<'resolved' | 'not_found' | 'already_resolved'>
  getProviderCancellation: (rootRunId: string) => Awaitable<ProviderCancellation | undefined>
  claimProviderCancellation: (cancellation: ProviderCancellation, run: RootRunSnapshot) => Awaitable<'claimed' | 'existing' | 'conflict' | IncidentFrozenResult>
  resolveProviderCancellation: (cancellation: ProviderCancellation, run: RootRunSnapshot) => Awaitable<'resolved' | 'not_found' | 'already_resolved' | IncidentFrozenResult>
}>

export type ProviderCancellation = Readonly<{
  cancellationRequestId: string
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  bindingId: string
  idempotencyKey: string
  disposition: 'pending' | 'accepted' | 'rejected' | 'indeterminate'
  requestedAt: number
  resolvedAt?: number
  providerReference?: string
  reason?: string
}>

export type StepReleaseInput = Readonly<{
  grant: StepGrant
  disclosureGrant?: DisclosureGrant
  releasedAt: number
  run: RootRunSnapshot
  canaryRecoveryGrantId?: string
}>

export type StepReleaseResult =
  | 'released'
  | 'already_released'
  | 'release_conflict'
  | 'cancelled'
  | 'not_found'
  | Readonly<{ kind: 'incident_frozen'; freezeOrderId: string; incidentId: string; reason: string; epochDigest: string }>
  | Readonly<{ kind: 'incident_epoch_stale'; epochDigest: string }>

export type IncidentFrozenResult = Readonly<{
  kind: 'incident_frozen'
  freezeOrderId: string
  incidentId: string
  reason: string
  epochDigest: string
}>

export type ExecutionState =
  | Readonly<{ kind: 'pending'; rootRunId: string; authorizationRef: string; caller: Readonly<{ agentId: string; principalId: string }>; requestDigest: string; claimedAt: number; cancellationRequestedAt?: number }>
  | Readonly<{ kind: 'completed'; run: RootRunSnapshot; authorizationRef: string; requestDigest: string }>

export type ClaimExecutionInput = Readonly<{
  executionScope: string
  rootRunId: string
  authorizationRef: string
  consumedAt: number
  caller: Readonly<{ agentId: string; principalId: string }>
  run: RootRunSnapshot
  requestDigest: string
}>

export type ClaimExecutionResult =
  | Readonly<{ kind: 'claimed'; authorization: RouteAuthorization }>
  | ExecutionState
  | Readonly<{
      kind: 'refused'
      reason:
        | 'authorization_not_found'
        | 'authorization_consumed'
        | 'budget_authority_unavailable'
        | 'budget_capacity_exceeded'
        | 'budget_reservation_conflict'
        | 'data_authority_unavailable'
        | 'data_authority_capacity_exceeded'
        | 'incident_frozen'
        | 'incident_epoch_stale'
    }>

export function createInMemoryKernelStore(): KernelStore {
  const quotes = new Map<string, RouteQuote>()
  const quotesByRoutingRequestId = new Map<string, RouteQuote>()
  const authorizations = new Map<string, RouteAuthorization>()
  const runs = new Map<string, RootRunSnapshot>()
  const budgets = new Map<string, BudgetAuthority>()
  const dataBudgets = new Map<string, DataAuthorizationBudget>()
  const dataAllocations = new Map<string, Readonly<{
    dataAuthorizationBudgetRef: string
    remainingAttempts: number
    remainingExposures: number
  }>>()
  const executions = new Map<string, ExecutionState>()
  const stepReleases = new Map<string, StepReleaseInput>()
  const providerCancellations = new Map<string, ProviderCancellation>()

  return Object.freeze({
    incidentRecoveryAuthority: 'none' as const,
    putQuote: (quote: RouteQuote) => {
      const existing = quotesByRoutingRequestId.get(quote.routingRequestId)
      if (existing !== undefined && existing.quoteDigest !== quote.quoteDigest) throw new Error('routing_request_identity_conflict')
      quotes.set(quote.quoteId, quote)
      quotesByRoutingRequestId.set(quote.routingRequestId, quote)
    },
    getQuote: (quoteId: string) => quotes.get(quoteId),
    getQuoteByRoutingRequestId: (routingRequestId: string) => quotesByRoutingRequestId.get(routingRequestId),
    putAuthorization: (authorization: RouteAuthorization) => {
      authorizations.set(authorization.authorizationRef, authorization)
    },
    getAuthorization: (authorizationRef: string) => authorizations.get(authorizationRef),
    getBudgetAuthority: (budgetAuthorityRef: string) => budgets.get(budgetAuthorityRef),
    getDataAuthorizationBudget: (dataAuthorizationBudgetRef: string) => dataBudgets.get(dataAuthorizationBudgetRef),
    getRun: (rootRunId: string) => runs.get(rootRunId),
    getExecution: (executionScope: string) => executions.get(executionScope),
    claimExecution: (input: ClaimExecutionInput): ClaimExecutionResult => {
      const existing = executions.get(input.executionScope)
      if (existing !== undefined) return existing

      const authorization = authorizations.get(input.authorizationRef)
      if (authorization === undefined) return { kind: 'refused', reason: 'authorization_not_found' }
      if (authorization.consumedAt !== undefined) return { kind: 'refused', reason: 'authorization_consumed' }

      const authority = budgets.get(authorization.budgetAuthorityRef) ?? createBudgetAuthority({
        budgetAuthorityRef: authorization.budgetAuthorityRef,
        sourceGrantId: authorization.budgetAuthorityRef,
        agentId: authorization.agentId,
        principalId: authorization.principalId,
        networkId: input.run.networkId,
        railProfileId: 'provider-cost-v1',
        currency: authorization.currency,
        maximumGrossMinor: authorization.budgetMaximumGrossMinor,
        expiresAt: authorization.expiresAt,
      })
      if (authority.agentId !== input.caller.agentId || authority.principalId !== input.caller.principalId
        || authority.networkId !== input.run.networkId || authority.currency !== input.run.cost.quotedMaximum.currency) {
        return { kind: 'refused', reason: 'budget_authority_unavailable' }
      }
      const reservation = reserveBudget(authority, {
        rootRunId: input.rootRunId,
        amountMinor: input.run.cost.quotedMaximum.amountMinor,
        currency: input.run.cost.quotedMaximum.currency,
        now: input.consumedAt,
      })
      if (reservation.kind === 'refused') return {
        kind: 'refused',
        reason: reservation.reason === 'budget_capacity_exceeded' ? 'budget_capacity_exceeded'
          : reservation.reason === 'budget_reservation_conflict' ? 'budget_reservation_conflict'
            : 'budget_authority_unavailable',
      }

      const disclosureAttempts = authorization.maximumDisclosureAttempts
      const disclosureExposures = authorization.maximumDisclosureExposures
      if (disclosureAttempts > 0 || disclosureExposures > 0) {
        const dataBudget = dataBudgets.get(authorization.dataAuthorizationBudgetRef) ?? createDataBudgetFromAuthorization(authorization, input.run.networkId)
        if (dataBudget.status !== 'active' || dataBudget.expiresAt <= input.consumedAt
          || dataBudget.agentId !== input.caller.agentId || dataBudget.principalId !== input.caller.principalId
          || dataBudget.networkId !== input.run.networkId) {
          return { kind: 'refused', reason: 'data_authority_unavailable' }
        }
        const reserved = [...dataAllocations.values()]
          .filter((allocation) => allocation.dataAuthorizationBudgetRef === dataBudget.dataAuthorizationBudgetRef)
          .reduce((total, allocation) => ({
            attempts: total.attempts + allocation.remainingAttempts,
            exposures: total.exposures + allocation.remainingExposures,
          }), { attempts: 0, exposures: 0 })
        if (dataBudget.consumedAttempts + reserved.attempts + disclosureAttempts > dataBudget.maximumAttempts
          || dataBudget.consumedExposures + reserved.exposures + disclosureExposures > dataBudget.maximumExposures) {
          return { kind: 'refused', reason: 'data_authority_capacity_exceeded' }
        }
        dataBudgets.set(dataBudget.dataAuthorizationBudgetRef, dataBudget)
        dataAllocations.set(input.rootRunId, Object.freeze({
          dataAuthorizationBudgetRef: dataBudget.dataAuthorizationBudgetRef,
          remainingAttempts: disclosureAttempts,
          remainingExposures: disclosureExposures,
        }))
      }

      const consumed = Object.freeze({ ...authorization, consumedAt: input.consumedAt })
      authorizations.set(input.authorizationRef, consumed)
      budgets.set(authorization.budgetAuthorityRef, reservation.authority)
      executions.set(input.executionScope, Object.freeze({ kind: 'pending', rootRunId: input.rootRunId, authorizationRef: input.authorizationRef, caller: input.caller, requestDigest: input.requestDigest, claimedAt: input.consumedAt }))
      runs.set(input.rootRunId, input.run)
      return { kind: 'claimed', authorization: consumed }
    },
    completeExecution: (executionScope: string, run: RootRunSnapshot) => {
      const existing = executions.get(executionScope)
      if (existing === undefined) throw new Error('execution_claim_missing')
      runs.set(run.rootRunId, run)
      resolveInMemoryBudget(budgets, authorizations, existing, run)
      dataAllocations.delete(run.rootRunId)
      executions.set(executionScope, Object.freeze({ kind: 'completed', run, authorizationRef: existing.authorizationRef, requestDigest: existing.requestDigest }))
    },
    reconcileRun: (rootRunId: string, leafRunId: string, run: RootRunSnapshot) => {
      const current = runs.get(rootRunId)
      if (current === undefined) return 'not_found'
      if (current.state !== 'outcome_unknown') return 'not_unknown'
      if (!current.leaves.some((leaf) => leaf.leafRunId === leafRunId && leaf.state === 'outcome_unknown')) return 'not_unknown'
      runs.set(rootRunId, run)
      const execution = [...executions.values()].find((candidate) => candidate.kind === 'completed' && candidate.run.rootRunId === rootRunId)
      if (execution !== undefined) resolveInMemoryBudget(budgets, authorizations, execution, run)
      dataAllocations.delete(rootRunId)
      for (const [scope, execution] of executions) {
        if (execution.kind === 'completed' && execution.run.rootRunId === rootRunId) {
          executions.set(scope, Object.freeze({ kind: 'completed', run, authorizationRef: execution.authorizationRef, requestDigest: execution.requestDigest }))
        }
      }
      return 'applied'
    },
    requestCancellation: (rootRunId, caller, requestedAt) => {
      for (const [scope, execution] of executions) {
        if (execution.kind === 'pending' && execution.rootRunId === rootRunId) {
          if (execution.caller.agentId !== caller.agentId || execution.caller.principalId !== caller.principalId) return 'not_owner'
          if ([...stepReleases.values()].some((release) => release.grant.rootRunId === rootRunId)) return 'not_possible'
          executions.set(scope, Object.freeze({ ...execution, cancellationRequestedAt: requestedAt }))
          return 'requested'
        }
        if (execution.kind === 'completed' && execution.run.rootRunId === rootRunId) return 'not_possible'
      }
      return 'not_found'
    },
    authorizeProviderRelease: (input) => {
      const { grant, disclosureGrant } = input
      if (!isValidStepGrant(grant) || input.releasedAt >= grant.expiresAt
        || (grant.disclosedDataFields.length === 0) !== (disclosureGrant === undefined)
        || (disclosureGrant !== undefined && (!isValidDisclosureGrant(disclosureGrant) || input.releasedAt >= disclosureGrant.expiresAt))) return 'release_conflict'
      const quote = quotes.get(grant.quoteId)
      const step = quote?.selectedGraph.steps.find((candidate) => candidate.bindingId === grant.bindingId)
      if (quote === undefined || quote.quoteDigest !== grant.quoteDigest || step === undefined
        || step.nodeId !== grant.nodeId || step.capabilityContractId !== grant.capabilityContractId
        || step.maximumCost.currency !== grant.maximumCost.currency || step.maximumCost.amountMinor !== grant.maximumCost.amountMinor
        || grant.disclosedDataFields.some((field) => !step.dataFields.includes(field))
        || grant.maximumCost.currency !== input.run.cost.authorized.currency
        || grant.maximumCost.amountMinor > input.run.cost.authorized.amountMinor) return 'release_conflict'
      if (input.run.rootRunId !== grant.rootRunId
        || input.run.quoteId !== grant.quoteId
        || input.run.quoteDigest !== grant.quoteDigest
        || !input.run.leaves.some((leaf) => leaf.leafRunId === grant.leafRunId
          && leaf.stepGrantId === grant.stepGrantId
          && leaf.bindingId === grant.bindingId
          && leaf.nodeId === grant.nodeId
          && leaf.capabilityContractId === grant.capabilityContractId)) return 'release_conflict'
      const existing = stepReleases.get(grant.stepGrantId)
      if (existing !== undefined) {
        return sameStepGrant(existing.grant, grant)
          && (existing.disclosureGrant === undefined
            ? disclosureGrant === undefined
            : disclosureGrant !== undefined && sameDisclosureGrant(existing.disclosureGrant, disclosureGrant))
          ? 'already_released'
          : 'release_conflict'
      }
      for (const execution of executions.values()) if (execution.kind === 'pending' && execution.rootRunId === grant.rootRunId) {
        if (execution.requestDigest !== grant.requestDigest) return 'release_conflict'
        if (execution.cancellationRequestedAt !== undefined) return 'cancelled'
        const authorization = authorizations.get(execution.authorizationRef)
        if (authorization === undefined) return 'release_conflict'
        if (disclosureGrant !== undefined && (authorization.dataAuthorizationBudgetRef !== disclosureGrant.dataAuthorizationBudgetRef
          || disclosureGrant.rootRunId !== grant.rootRunId || disclosureGrant.leafRunId !== grant.leafRunId
          || disclosureGrant.stepGrantId !== grant.stepGrantId || disclosureGrant.quoteId !== grant.quoteId
          || disclosureGrant.quoteDigest !== grant.quoteDigest || disclosureGrant.requestDigest !== grant.requestDigest
          || disclosureGrant.recipientBindingId !== grant.bindingId
          || disclosureGrant.fields.some((field) => !grant.disclosedDataFields.includes(field)))) return 'release_conflict'
        if (disclosureGrant !== undefined) {
        const dataBudget = dataBudgets.get(authorization.dataAuthorizationBudgetRef)
        const allocation = dataAllocations.get(grant.rootRunId)
        if (dataBudget === undefined || allocation === undefined
          || allocation.dataAuthorizationBudgetRef !== dataBudget.dataAuthorizationBudgetRef
          || allocation.remainingAttempts < 1 || allocation.remainingExposures < 1) return 'release_conflict'
        const consumed = consumeDisclosureGrant(dataBudget, {
          disclosureGrantId: disclosureGrant.disclosureGrantId, rootRunId: disclosureGrant.rootRunId,
          leafRunId: disclosureGrant.leafRunId, attempt: disclosureGrant.attempt,
          recipientBindingId: disclosureGrant.recipientBindingId, purpose: disclosureGrant.purpose,
          fields: disclosureGrant.fields, projectionDigest: disclosureGrant.projectionDigest, now: input.releasedAt,
        })
        if (consumed.kind === 'refused') return 'release_conflict'
        dataBudgets.set(authorization.dataAuthorizationBudgetRef, consumed.budget)
        dataAllocations.set(grant.rootRunId, Object.freeze({
          ...allocation,
          remainingAttempts: allocation.remainingAttempts - 1,
          remainingExposures: allocation.remainingExposures - 1,
        }))
        }
        stepReleases.set(grant.stepGrantId, Object.freeze({ ...input, grant: Object.freeze({ ...grant }) }))
        runs.set(grant.rootRunId, input.run)
        return 'released'
      }
      return 'not_found'
    },
    resolveDisclosureAttempt: (disclosureGrantId, disposition, resolvedAt) => {
      for (const [ref, budget] of dataBudgets) {
        if (!budget.attempts.some((attempt) => attempt.disclosureGrantId === disclosureGrantId)) continue
        const result = resolveDataAttempt(budget, { disclosureGrantId, disposition, now: resolvedAt })
        if (result.kind === 'refused') return result.reason === 'disclosure_attempt_not_found' ? 'not_found' : 'already_resolved'
        dataBudgets.set(ref, result.budget)
        return 'resolved'
      }
      return 'not_found'
    },
    getProviderCancellation: (rootRunId) => providerCancellations.get(rootRunId),
    claimProviderCancellation: (cancellation, run) => {
      const existing = providerCancellations.get(cancellation.rootRunId)
      if (existing !== undefined) return sameProviderCancellationIdentity(existing, cancellation) ? 'existing' : 'conflict'
      providerCancellations.set(cancellation.rootRunId, Object.freeze({ ...cancellation }))
      runs.set(run.rootRunId, run)
      return 'claimed'
    },
    resolveProviderCancellation: (cancellation, run) => {
      const existing = providerCancellations.get(cancellation.rootRunId)
      if (existing === undefined) return 'not_found'
      if (existing.disposition !== 'pending' && existing.disposition !== 'indeterminate') return 'already_resolved'
      if (!sameProviderCancellationIdentity(existing, cancellation)) return 'not_found'
      providerCancellations.set(cancellation.rootRunId, Object.freeze({ ...cancellation }))
      runs.set(run.rootRunId, run)
      return 'resolved'
    },
  })
}

function sameProviderCancellationIdentity(left: ProviderCancellation, right: ProviderCancellation) {
  return left.cancellationRequestId === right.cancellationRequestId && left.rootRunId === right.rootRunId
    && left.leafRunId === right.leafRunId && left.stepGrantId === right.stepGrantId
    && left.bindingId === right.bindingId && left.idempotencyKey === right.idempotencyKey
}

function createDataBudgetFromAuthorization(authorization: RouteAuthorization, networkId: string) {
  return createDataAuthorizationBudget({
    dataAuthorizationBudgetRef: authorization.dataAuthorizationBudgetRef,
    sourceGrantId: authorization.dataAuthorizationBudgetRef,
    agentId: authorization.agentId,
    principalId: authorization.principalId,
    networkId,
    protectedFieldSetId: authorization.protectedFieldSetId,
    permittedFields: authorization.allowedDataFields,
    permittedRecipientBindingIds: authorization.allowedRecipientBindingIds,
    permittedPurposes: authorization.allowedDisclosurePurposes,
    maximumAttempts: authorization.dataBudgetMaximumAttempts,
    maximumExposures: authorization.dataBudgetMaximumExposures,
    expiresAt: authorization.expiresAt,
  })
}

function resolveInMemoryBudget(
  budgets: Map<string, BudgetAuthority>,
  authorizations: Map<string, RouteAuthorization>,
  execution: ExecutionState,
  run: RootRunSnapshot,
) {
  const authorization = authorizations.get(execution.authorizationRef)
  if (authorization === undefined) throw new Error('budget_authorization_missing')
  const authority = budgets.get(authorization.budgetAuthorityRef)
  if (authority === undefined) throw new Error('budget_authority_missing')
  const resolution = run.effectState === 'committed' ? 'committed'
    : run.effectState === 'not_committed' || run.effectState === 'not_started' ? 'not_committed'
      : 'unknown'
  const result = resolveBudgetReservation(authority, { rootRunId: run.rootRunId, resolution, now: run.records.at(-1)?.occurredAt ?? 0 })
  if (result.kind === 'resolved') budgets.set(authority.budgetAuthorityRef, result.authority)
}
