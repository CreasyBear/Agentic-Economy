import { getFunctionName } from 'convex/server'
import { expect, vi } from 'vitest'
import { buildDevelopmentPublishedToolEvidence } from '../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'
import { materializeRuntimePublishedTool } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  cancelCall,
  cancelOwnerCall,
  projectRecovery,
  readOwnerCallStatus,
  reconcileCall,
  reconcileOwnerCall,
} from '../../convex/capabilityCalls'
import { readCallStatus } from '../../convex/capabilityCallsStatus'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { recover } from '../../convex/capabilityCallWorker'

export type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
export type AuthIdentity = Readonly<{ subject: string; tokenIdentifier: string }>
export type WorkerRecoverMode = 'status' | 'cancel' | 'reconcile'
export type OwnerRecoverMode = WorkerRecoverMode
export type AgentRecoverMode = WorkerRecoverMode

export type RecoveryRow = Readonly<{
  callRef: string
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  state: 'pending' | 'completed' | 'refused' | 'reconciliation_required' | 'cancelled'
  toolRef: string
  inputDigest: string
  requestDigest: string
  grantGeneration: number
  result?: Readonly<Record<string, unknown>> | undefined
  usage?: Readonly<Record<string, unknown>> | undefined
  evidenceHash?: string | undefined
  attemptRef?: string | undefined
  dispatchState?: 'enqueued' | 'running' | 'completed' | 'failed' | 'reconciliation_required' | undefined
  toolJson: string
  inputJson: string
  updatedAt?: number
}>

export const principal: AgentAccessPrincipal = {
  principalId: 'principal:one',
  ownerId: `acc_${'2'.repeat(32)}`,
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox',
  scopes: ['market_tools:call'],
  authorityMode: 'approval_required',
}
export const callRef = 'operation-invocation:v1:one'
export const row: RecoveryRow = {
  callRef,
  principalId: principal.principalId,
  ownerId: principal.ownerId,
  credentialId: principal.credentialId,
  applicationRef: principal.applicationRef,
  environment: principal.environment,
  state: 'pending',
  toolRef: 'operation:one',
  inputDigest: 'sha256:input',
  requestDigest: 'sha256:request',
  grantGeneration: 3,
  toolJson: '{}',
  inputJson: '{}',
}
export const evidence = {
  kind: 'action_invocation_reconciliation' as const,
  version: 1 as const,
  evidenceRef: 'evidence:one',
  source: 'operation:one',
  invocationRef: callRef,
  attemptRef: 'attempt:one',
  effectGeneration: 1,
  resolution: 'not_released' as const,
  observedAt: '2026-08-10T00:00:00.000Z',
  digest: 'sha256:evidence',
}
export const ownerIdentity: AuthIdentity = { subject: 'user_123', tokenIdentifier: 'clerk|user_123' }
export const invocationNotFound = {
  kind: 'refused' as const,
  callRef,
  code: 'invocation_not_found' as const,
  retryable: false as const,
}
export const canonicalAttemptRef = `operation-attempt:${callRef}:1`

export function functionPath(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

export function handlerFor(action: unknown): Handler {
  return (action as { _handler: Handler })._handler
}

export const projectRecoveryHandler = handlerFor(projectRecovery)
export const readOwnerCallStatusHandler = handlerFor(readOwnerCallStatus)
export const cancelOwnerCallHandler = handlerFor(cancelOwnerCall)
export const reconcileOwnerCallHandler = handlerFor(reconcileOwnerCall)
export const recoverHandler = handlerFor(recover)

const agentRecoveryHandlers = {
  status: readCallStatus,
  cancel: cancelCall,
  reconcile: reconcileCall,
} as const

export function freeTierUsage(usageRef: string, observedAt: number) {
  return {
    usageRef,
    observedAt,
    chargeState: 'free_tier' as const,
    amount: { currency: 'USD', units: '0', exponent: 2 },
    priceDigest: 'sha256:price',
  }
}

export function cancelledRefusal(toolRef: string) {
  return {
    kind: 'refused' as const,
    toolRef,
    code: 'invocation_cancelled' as const,
    retryable: false,
  }
}

export function foundCancelled(toolRef: string) {
  return {
    kind: 'found' as const,
    callRef,
    toolRef,
    state: 'cancelled' as const,
    result: cancelledRefusal(toolRef),
  }
}

export function workerRecoverArgs(mode: WorkerRecoverMode, overrides: Record<string, unknown> = {}) {
  return {
    callRef,
    principalId: principal.principalId,
    credentialId: principal.credentialId,
    mode,
    ...overrides,
  }
}

export async function expectWorkerRecover(
  context: ReturnType<typeof workerRecoveryContext>,
  mode: WorkerRecoverMode,
  expected: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
  matcher: 'equal' | 'matchObject' = 'equal',
) {
  const invocation = recoverHandler(context, workerRecoverArgs(mode, overrides))
  if (matcher === 'matchObject') {
    await expect(invocation).resolves.toMatchObject(expected)
  } else {
    await expect(invocation).resolves.toEqual(expected)
  }
}

export function expectNoEffectMutations(context: ReturnType<typeof workerRecoveryContext>) {
  expect(effectMutationCalls(context)).toHaveLength(0)
}

export function canonicalStatusFound(toolRef: string, state: string) {
  return {
    kind: 'found',
    callRef,
    toolRef,
    state,
    effectGeneration: 1,
    attemptRef: canonicalAttemptRef,
  }
}

export function pendingResult(toolRef: string) {
  return {
    kind: 'pending' as const,
    callRef,
    toolRef,
    retryAfterMs: 1_000,
  }
}

export function canonicalFixture(
  controlState:
    | Readonly<{ state: 'terminal' }>
    | Readonly<{ state: 'retryable'; reason: 'pre_release_failure' }>
    | Readonly<{ state: 'cancelled'; effect: 'not_released' }>,
) {
  const publishedEvidence = buildDevelopmentPublishedToolEvidence()
  const toolRef = `operation:v1:${canonicalDigest({ fixture: 'recovery' }).slice(7)}`
  const operation = { ...publishedEvidence.tool, operationId: toolRef }
  const descriptor = materializeRuntimePublishedTool(operation)
  const input = { symbol: 'BTC', convert: 'USD' }
  const inputDigest = canonicalDigest(input)
  const updatedAt = '2026-08-10T00:00:00.000Z'
  return {
    row: {
      ...row,
      toolRef,
      inputDigest,
      requestDigest: canonicalDigest({ toolRef, input }),
      toolJson: JSON.stringify(operation),
      inputJson: JSON.stringify(input),
    },
    control: {
      sourceRef: `operation-invocation-source:${callRef}`,
      preparedMaterialDigest: inputDigest,
      updatedAt,
      currentAttemptRef: canonicalAttemptRef,
      currentEffectGeneration: 1,
      control: {
        executionRef: callRef,
        executionVersion: 3,
        origin: {
          kind: 'standalone' as const,
          principalRef: principal.principalId,
          callerRef: principal.credentialId,
        },
        owner: {
          principalRef: principal.principalId,
          callerRef: principal.credentialId,
        },
        action: { id: toolRef, contractVersion: descriptor.version },
        desired: { state: 'invoke' as const },
        freshness: { state: 'current' as const, observedAt: updatedAt },
        control: controlState,
      },
    },
  }
}

export function ownerRecoveryContext(
  identityOrOwnerId: AuthIdentity | string | null,
  workerResult: Record<string, unknown>,
  recoveryRow: RecoveryRow | null = row,
) {
  const runAction = vi.fn(async (_reference: unknown, _args: unknown) => workerResult)
  const runQuery = vi.fn(async (reference: unknown) => {
    if (functionPath(reference) === 'capabilityCalls:readOwnerRecovery') return recoveryRow
    if (functionPath(reference) === 'capabilityCalls:readPurchaseResolution') return null
    if (functionPath(reference) === 'capabilityCalls:readOwnerReceiptContext') return {
      purpose: null,
      agent: { principalRef: principal.principalId, applicationRef: principal.applicationRef, currentDisplayName: null },
      recordedTool: { kind: 'unavailable' },
      reconciliation: { canSubmitEvidence: true, permissionBasis: 'account_owner', requiresVerifiedEvidence: true },
    }
    throw new Error(`unexpected_owner_query:${functionPath(reference)}`)
  })
  const identity = identityOrOwnerId === null
    ? null
    : typeof identityOrOwnerId === 'string'
      ? { subject: identityOrOwnerId, tokenIdentifier: identityOrOwnerId }
      : identityOrOwnerId
  const getUserIdentity = vi.fn(async () => identity)
  return { runAction, runQuery, auth: { getUserIdentity } }
}

export function recoveryContext(options: Readonly<{
  row: RecoveryRow | null
  grant: Readonly<{ generation: number }> | null
  workerResult: Record<string, unknown>
  control?: unknown
}>) {
  const runAction = vi.fn(async (_reference: unknown, _args: unknown) => options.workerResult)
  const runQuery = vi.fn(async (reference: unknown, queryArgs: unknown) => {
    switch (functionPath(reference)) {
      case 'capabilityCalls:readOwnerRecovery': return options.row
      case 'capabilityCalls:readPurchaseResolution': return null
      case 'actionExecutionControl:readControl': return options.control ?? null
      case 'agentAccessPolicy:readActiveGrant': {
        const requestedGeneration = typeof queryArgs === 'object'
          && queryArgs !== null
          && 'generation' in queryArgs
          && typeof queryArgs.generation === 'number'
          ? queryArgs.generation
          : undefined
        return options.grant !== null && options.grant.generation === requestedGeneration ? options.grant : null
      }
      default: throw new Error(`unexpected_query:${functionPath(reference)}`)
    }
  })
  const runMutation = vi.fn(async (reference: unknown, args: Record<string, unknown>) => {
    if (functionPath(reference) === 'capabilityCalls:resolveCallAgentAuthority') return args.principal
    return { kind: 'accepted' }
  })
  const db = {
    query: (table: string) => {
      let callRef: unknown
      const query = {
        withIndex: (_index: string, build: (builder: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
          const builder = { eq: (field: string, value: unknown) => {
            if (field === 'callRef') callRef = value
            return builder
          } }
          build(builder)
          return query
        },
        unique: async () => table === 'capabilityCalls' && options.row?.callRef === callRef
          ? { ...options.row, updatedAt: options.row.updatedAt ?? 1 }
          : null,
      }
      return query
    },
  }
  return { db, runAction, runQuery, runMutation }
}

export function recoveryArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operationKey: 'operation-recovery:test',
    correlationId: 'correlation:recovery:test',
    principal,
    callRef,
    ...overrides,
  }
}

export function workerRecoveryContext(
  initialRow: RecoveryRow,
  control: unknown = undefined,
  moneyResult: Readonly<{ kind: 'none' | 'settled' | 'reconciliation_required' }> = { kind: 'none' },
  historyCommand: unknown = null,
) {
  let currentRow = initialRow
  const runQuery = vi.fn(async (reference: unknown) => {
    const path = functionPath(reference)
    if (path === 'capabilityCalls:readRecovery') return currentRow
    if (path.endsWith(':readControl')) return control
    if (path === 'moneyX402PaymentAttempts:readX402PaymentAttempt') {
      return {
        state: 'observed',
        paymentIdentifier: 'payment:recovery',
        paymentResolution: 'not_released',
        transportRequestDigest: 'sha256:request',
        transportObservationDigest: 'sha256:transport',
        paymentObservationDigest: 'sha256:payment',
      }
    }
    if (path.endsWith(':readAttempts')) {
      if (
        typeof control === 'object'
        && control !== null
        && 'currentAttemptRef' in control
        && typeof control.currentAttemptRef === 'string'
      ) {
        const effectGeneration = 'currentEffectGeneration' in control && typeof control.currentEffectGeneration === 'number'
          ? control.currentEffectGeneration
          : 1
        return [{
          executionRef: currentRow.callRef,
          attemptRef: control.currentAttemptRef,
          attemptNumber: 1,
          effectGeneration,
          actor: { callerRef: currentRow.credentialId, principalRef: currentRow.principalId },
          lease: { owner: 'worker:one', expiresAt: '2026-08-10T00:00:00.000Z' },
          idempotency: { operationKey: currentRow.toolRef, materialInputDigest: currentRow.inputDigest, effectIdentity: 'effect:one' },
          release: { state: 'not_released' },
          outcome: { state: 'failed', retry: 'safe_before_release' },
          recordedAt: '2026-08-10T00:00:00.000Z',
        }]
      }
      return []
    }
    if (path.endsWith(':readHistory')) return []
    if (path.endsWith(':readHistoryCommand')) return historyCommand
    throw new Error(`unexpected_worker_query:${path}`)
  })
  const runMutation = vi.fn(async (reference: unknown, args: unknown) => {
    const path = functionPath(reference)
    if (path === 'capabilityCalls:reconcileCallWorkloadAuthority') {
      return {
        kind: 'authorized',
        authority: {
          principalId: currentRow.principalId,
          accountRef: currentRow.ownerId,
          credentialId: currentRow.credentialId,
          grantRef: 'grant:current',
          grantGeneration: currentRow.grantGeneration,
          policyDigest: 'sha256:policy',
          expiresAt: 9_999_999,
        },
      }
    }
    if (path === 'capabilityCalls:cancelBeforeClaim') {
      currentRow = {
        ...currentRow,
        state: 'cancelled',
        result: cancelledRefusal(currentRow.toolRef),
        attemptRef: undefined,
        dispatchState: 'failed',
      }
      return { kind: 'cancelled' }
    }
    if (path === 'moneyLedger:reconcileInvocationCharge') return moneyResult
    if (path === 'moneyX402PaymentAttempts:reconcileX402PaymentAttempt') {
      return { kind: 'settled', settlementStatus: 'settled' }
    }
    if (
      path === 'capabilityCalls:projectRecovery'
      && typeof args === 'object'
      && args !== null
      && 'state' in args
      && (args.state === 'pending'
        || args.state === 'completed'
        || args.state === 'refused'
        || args.state === 'reconciliation_required'
        || args.state === 'cancelled')
    ) {
      const projection = args as {
        state: RecoveryRow['state']
        result?: Readonly<Record<string, unknown>>
        clearResult?: boolean
        clearAttemptRef?: boolean
        clearEvidenceHash?: boolean
      }
      currentRow = {
        ...currentRow,
        state: projection.state,
        ...(projection.clearResult === true
          ? { result: undefined }
          : projection.result === undefined
            ? {}
            : { result: projection.result }),
        ...(projection.clearAttemptRef === true ? { attemptRef: undefined } : {}),
        ...(projection.clearEvidenceHash === true ? { evidenceHash: undefined } : {}),
      }
    }
    return { kind: 'recorded' }
  })
  return { runQuery, runMutation }
}

export function effectMutationCalls(context: { runMutation: ReturnType<typeof vi.fn> }) {
  return context.runMutation.mock.calls.filter(([reference]) => (
    functionPath(reference) !== 'capabilityCalls:reconcileCallWorkloadAuthority'
  ))
}

export function projectionContext(initialRow: RecoveryRow) {
  let currentRow: Record<string, unknown> = { ...initialRow, _id: 'invocation:one' }
  const query = {
    withIndex: (_name: unknown, build: (builder: { eq: () => unknown }) => unknown) => {
      build({ eq: () => undefined })
      return query
    },
    unique: async () => currentRow,
  }
  const db = {
    query: (_table: unknown) => query,
    patch: async (_id: string, value: Record<string, unknown>) => {
      currentRow = { ...currentRow, ...value }
    },
  }
  return { db, read: () => currentRow }
}

export function invokeAgentRecoveryHandler(
  mode: AgentRecoverMode,
  context: ReturnType<typeof recoveryContext>,
  args: Record<string, unknown>,
) {
  return handlerFor(agentRecoveryHandlers[mode])(context, args)
}

export function invokeOwnerRecoveryHandler(
  mode: OwnerRecoverMode,
  context: ReturnType<typeof ownerRecoveryContext>,
  callArgs: Record<string, unknown>,
) {
  switch (mode) {
    case 'status':
      return readOwnerCallStatusHandler(context, callArgs)
    case 'cancel':
      return cancelOwnerCallHandler(context, callArgs)
    case 'reconcile':
      return reconcileOwnerCallHandler(context, callArgs)
    default: {
      const neverMode: never = mode
      throw new Error(`unexpected_owner_mode:${neverMode}`)
    }
  }
}

export function expectOwnerRecoverAction(
  context: ReturnType<typeof ownerRecoveryContext>,
  mode: OwnerRecoverMode,
  actionExtra: Record<string, unknown> = {},
) {
  expect(context.runAction).toHaveBeenCalledTimes(1)
  expect(context.runAction.mock.calls[0]?.[1]).toEqual({
    callRef,
    principalId: principal.principalId,
    credentialId: principal.credentialId,
    recoverAsOwner: true,
    mode,
    ...actionExtra,
  })
}

export async function expectOwnerHandlersRefuse(context: ReturnType<typeof ownerRecoveryContext>) {
  await expect(readOwnerCallStatusHandler(context, { callRef })).resolves.toEqual(invocationNotFound)
  await expect(reconcileOwnerCallHandler(context, {
    callRef,
    idempotencyKey: 'reconcile:foreign',
    evidence,
  })).resolves.toEqual(invocationNotFound)
  await expect(cancelOwnerCallHandler(context, {
    callRef,
    idempotencyKey: 'cancel:foreign',
  })).resolves.toEqual(invocationNotFound)
  expect(context.runAction).not.toHaveBeenCalled()
}

export function expectAgentRecoverWorkerAction(
  context: ReturnType<typeof recoveryContext>,
  mode: AgentRecoverMode,
  successor: AgentAccessPrincipal,
  actionExtra: Record<string, unknown> = {},
) {
  expect(context.runAction.mock.calls[0]?.[1]).toEqual({
    callRef,
    principalId: principal.principalId,
    credentialId: principal.credentialId,
    recoveryPrincipal: successor,
    mode,
    ...actionExtra,
  })
}

export function expectReadOwnerRecoveryQuery(context: ReturnType<typeof recoveryContext>) {
  expect(context.runQuery).toHaveBeenCalled()
  expect(functionPath(context.runQuery.mock.calls[0]?.[0])).toBe('capabilityCalls:readOwnerRecovery')
}

export function foundWorkerResult(state: string, overrides: Record<string, unknown> = {}) {
  return { kind: 'found', callRef, toolRef: row.toolRef, state, ...overrides }
}

export function projectRecoveryMutationArgs(result: Record<string, unknown>) {
  return {
    callRef,
    principalId: principal.principalId,
    credentialId: principal.credentialId,
    state: 'reconciliation_required' as const,
    result,
    clearResult: false,
    clearWorkId: false,
    clearAttemptRef: false,
    clearEvidenceHash: false,
    clearDispatchState: false,
    now: 1_000,
  }
}
