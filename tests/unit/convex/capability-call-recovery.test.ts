import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'
import { materializeRuntimePublishedTool } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  cancelCall,
  cancelOwnerCall,
  projectRecovery,
  readCallStatus,
  readOwnerCallStatus,
  reconcileCall,
  reconcileOwnerCall,
} from '../../../convex/capabilityCalls'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { recover } from '../../../convex/capabilityCallWorker'
type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
type AuthIdentity = Readonly<{ subject: string; tokenIdentifier: string }>

vi.mock('../../../convex/authz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../convex/authz')>()),
  resolveBusinessActor: vi.fn(async (ctx: { auth: { getUserIdentity: () => Promise<AuthIdentity | null> } }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) return { kind: 'anonymous', anonymousBucket: 'convex:anonymous' }
    return {
      kind: 'authenticated_owner', clerkUserId: identity.tokenIdentifier,
      canonicalPrincipalRef: identity.tokenIdentifier === 'clerk|user_123'
        ? `prn_${'1'.repeat(32)}` : `prn_${'9'.repeat(32)}`,
      canonicalAccountRef: identity.tokenIdentifier === 'clerk|user_123'
        ? `acc_${'2'.repeat(32)}` : `acc_${'8'.repeat(32)}`,
      authorityRevision: {}, authorityProvenance: {},
    }
  }),
}))

type RecoveryRow = Readonly<{
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
}>

const principal: AgentAccessPrincipal = {
  principalId: 'principal:one',
  ownerId: `acc_${'2'.repeat(32)}`,
  credentialId: 'credential:one',
  applicationRef: 'application:one',
  environment: 'sandbox',
  scopes: ['market_tools:call'],
  authorityMode: 'approval_required',
}
const callRef = 'operation-invocation:v1:one'
const row: RecoveryRow = {
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
function canonicalFixture(
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
      currentAttemptRef: `operation-attempt:${callRef}:1`,
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
const evidence = {
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

function functionPath(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

function handlerFor(action: unknown): Handler {
  return (action as { _handler: Handler })._handler
}
const projectRecoveryHandler = handlerFor(projectRecovery)
const readOwnerCallStatusHandler = handlerFor(readOwnerCallStatus)
const cancelOwnerCallHandler = handlerFor(cancelOwnerCall)
const reconcileOwnerCallHandler = handlerFor(reconcileOwnerCall)

function ownerRecoveryContext(
  identityOrOwnerId: AuthIdentity | string | null,
  workerResult: Record<string, unknown>,
  recoveryRow: RecoveryRow | null = row,
) {
  const runAction = vi.fn(async (_reference: unknown, _args: unknown) => workerResult)
  const runQuery = vi.fn(async (reference: unknown) => {
    if (functionPath(reference) === 'capabilityCalls:readOwnerRecovery') return recoveryRow
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

function recoveryContext(options: Readonly<{
  row: RecoveryRow | null
  grant: Readonly<{ generation: number }> | null
  workerResult: Record<string, unknown>
}>) {
  const runAction = vi.fn(async (_reference: unknown, _args: unknown) => options.workerResult)
  const runQuery = vi.fn(async (reference: unknown, queryArgs: unknown) => {
    switch (functionPath(reference)) {
      case 'capabilityCalls:readOwnerRecovery': return options.row
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
  return { runAction, runQuery, runMutation }
}
function recoveryArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operationKey: 'operation-recovery:test',
    correlationId: 'correlation:recovery:test',
    principal,
    callRef,
    ...overrides,
  }
}
function workerRecoveryContext(
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
        result: {
          kind: 'refused',
          toolRef: currentRow.toolRef,
          code: 'invocation_cancelled',
          retryable: false,
        },
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

function effectMutationCalls(context: { runMutation: ReturnType<typeof vi.fn> }) {
  return context.runMutation.mock.calls.filter(([reference]) => (
    functionPath(reference) !== 'capabilityCalls:reconcileCallWorkloadAuthority'
  ))
}
const ownerIdentity: AuthIdentity = { subject: 'user_123', tokenIdentifier: 'clerk|user_123' }
function projectionContext(initialRow: RecoveryRow) {
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

describe('capability operation recovery Convex adapters', () => {
  it('admits the exact x402 reconciliation evidence object in both public Convex actions', () => {
    const expectedFields = [
      'amount',
      'attemptRef',
      'challengeDigest',
      'digest',
      'effectGeneration',
      'evidenceRef',
      'inputDigest',
      'invocationRef',
      'kind',
      'observedAt',
      'operationRef',
      'paymentIdentifier',
      'paymentObservationDigest',
      'paymentResponseDigest',
      'providerRef',
      'requestDigest',
      'reservationRef',
      'settlementStatus',
      'source',
      'transactionHash',
      'transportObservationDigest',
      'version',
    ]
    for (const action of [reconcileCall, reconcileOwnerCall]) {
      const registered = action as unknown as { exportArgs(): string }
      const args = JSON.parse(registered.exportArgs()) as {
        value: Record<string, { fieldType: { type: string; value?: Array<{ type: string; value: Record<string, unknown> }> } }>
      }
      const evidence = args.value.evidence?.fieldType
      expect(evidence?.type).toBe('union')
      const x402 = evidence?.value?.find((member) => {
        if (member.type !== 'object') return false
        const kind = member.value.kind as { fieldType?: { value?: unknown } } | undefined
        return kind?.fieldType?.value === 'x402_payment_reconciliation'
      })
      expect(Object.keys(x402?.value ?? {}).sort()).toEqual(expectedFields)
    }
  })

  it('hands status and remedies to the worker with original effect identity after credential replacement', async () => {
    const successor = { ...principal, credentialId: 'credential:successor' }
    const statusContext = recoveryContext({
      row,
      grant: null,
      workerResult: { kind: 'found', callRef, toolRef: row.toolRef, state: 'in_progress' },
    })
    await expect(handlerFor(readCallStatus)(statusContext, recoveryArgs({ principal: successor }))).resolves.toMatchObject({ state: 'in_progress' })
    expect(statusContext.runAction).toHaveBeenCalledTimes(1)
    expect(statusContext.runAction.mock.calls[0]?.[1]).toEqual({
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      recoveryPrincipal: successor,
      mode: 'status',
    })

    const cancelContext = recoveryContext({
      row,
      grant: { generation: row.grantGeneration + 1 },
      workerResult: { kind: 'found', callRef, toolRef: row.toolRef, state: 'cancelled' },
    })
    await expect(handlerFor(cancelCall)(cancelContext, recoveryArgs({ principal: successor, idempotencyKey: 'cancel:one' }))).resolves.toMatchObject({ state: 'cancelled' })
    expect(cancelContext.runAction.mock.calls[0]?.[1]).toEqual({
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      recoveryPrincipal: successor,
      mode: 'cancel',
      idempotencyKey: 'cancel:one',
    })

    const reconcileContext = recoveryContext({
      row,
      grant: { generation: row.grantGeneration + 1 },
      workerResult: { kind: 'found', callRef, toolRef: row.toolRef, state: 'terminal' },
    })
    await expect(handlerFor(reconcileCall)(reconcileContext, recoveryArgs({ principal: successor, idempotencyKey: 'reconcile:one', evidence }))).resolves.toMatchObject({ state: 'terminal' })
    expect(reconcileContext.runAction.mock.calls[0]?.[1]).toEqual({
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      recoveryPrincipal: successor,
      mode: 'reconcile',
      evidence,
    })
    expect(statusContext.runMutation).toHaveBeenCalledTimes(2)
    expect(cancelContext.runMutation).toHaveBeenCalledTimes(2)
    expect(reconcileContext.runMutation).toHaveBeenCalledTimes(2)
    for (const context of [statusContext, cancelContext, reconcileContext]) {
      expect(context.runQuery).toHaveBeenCalledTimes(1)
      expect(functionPath(context.runQuery.mock.calls[0]?.[0])).toBe('capabilityCalls:readOwnerRecovery')
    }
  })
  it('allows the owning Clerk session to continue status and reconciliation after agent revocation', async () => {
    const ownerRow = { ...row, inputJson: JSON.stringify({ city: 'Perth', units: 'metric' }) }
    const statusContext = ownerRecoveryContext(ownerIdentity, {
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'reconciliation_required',
      attemptRef: evidence.attemptRef,
    }, ownerRow)
    await expect(readOwnerCallStatusHandler(statusContext, { callRef })).resolves.toMatchObject({
      kind: 'found',
      state: 'reconciliation_required',
      previousInput: { city: 'Perth', units: 'metric' },
    })
    expect(statusContext.runAction).toHaveBeenCalledWith(expect.anything(), {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      recoverAsOwner: true,
      mode: 'status',
    })
    const cancelContext = ownerRecoveryContext(ownerIdentity, {
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'cancelled',
    })
    await expect(cancelOwnerCallHandler(cancelContext, {
      callRef,
      idempotencyKey: 'cancel:owner:one',
    })).resolves.toMatchObject({ kind: 'found', state: 'cancelled' })
    expect(cancelContext.runAction).toHaveBeenCalledWith(expect.anything(), {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      recoverAsOwner: true,
      mode: 'cancel',
      idempotencyKey: 'cancel:owner:one',
    })


    const reconcileContext = ownerRecoveryContext(ownerIdentity, {
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'terminal',
    })
    await expect(reconcileOwnerCallHandler(reconcileContext, {
      callRef,
      idempotencyKey: 'reconcile:owner:one',
      evidence,
    })).resolves.toMatchObject({ kind: 'found', state: 'terminal' })
    expect(reconcileContext.runAction).toHaveBeenCalledWith(expect.anything(), {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      recoverAsOwner: true,
      mode: 'reconcile',
      evidence,
    })
  })

  it('returns not-found without recovery work for a foreign or unauthenticated Clerk session', async () => {
    for (const identity of [
      { subject: 'user_123', tokenIdentifier: 'clerk|other' },
      { subject: 'owner:other', tokenIdentifier: 'clerk|owner:other' },
      null,
    ] as const) {
      const context = ownerRecoveryContext(identity, {
        kind: 'found',
        callRef,
        toolRef: row.toolRef,
        state: 'terminal',
      })
      await expect(readOwnerCallStatusHandler(context, { callRef })).resolves.toEqual({
        kind: 'refused',
        callRef,
        code: 'invocation_not_found',
        retryable: false,
      })
      await expect(reconcileOwnerCallHandler(context, {
        callRef,
        idempotencyKey: 'reconcile:foreign',
        evidence,
      })).resolves.toEqual({
        kind: 'refused',
        callRef,
        code: 'invocation_not_found',
        retryable: false,
      })
      await expect(cancelOwnerCallHandler(context, {
        callRef,
        idempotencyKey: 'cancel:foreign',
      })).resolves.toEqual({
        kind: 'refused',
        callRef,
        code: 'invocation_not_found',
        retryable: false,
      })

      expect(context.runAction).not.toHaveBeenCalled()
    }
  })


  it('projects reconciliation-required status without hiding the invocation', async () => {
    const context = recoveryContext({
      row,
      grant: null,
      workerResult: { kind: 'reconciliation_required', callRef, toolRef: row.toolRef, evidence },
    })
    await expect(handlerFor(readCallStatus)(context, recoveryArgs())).resolves.toMatchObject({
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'reconciliation_required',
      attemptRef: evidence.attemptRef,
      effectGeneration: evidence.effectGeneration,
      version: expect.any(Number),
    })
  })

  it('keeps another Agent, Account, application, or environment indistinguishable from not-found', async () => {
    const wrongPrincipals: readonly AgentAccessPrincipal[] = [
      { ...principal, principalId: 'principal:other' },
      { ...principal, ownerId: 'account:other' },
      { ...principal, applicationRef: 'application:other' },
      { ...principal, environment: 'production' },
    ]
    for (const wrongPrincipal of wrongPrincipals) {
      const context = recoveryContext({
        row,
        grant: null,
        workerResult: { kind: 'found', callRef, toolRef: row.toolRef, state: 'in_progress' },
      })

      await expect(handlerFor(readCallStatus)(context, recoveryArgs({
        principal: wrongPrincipal,
      }))).resolves.toEqual({
        kind: 'refused',
        callRef,
        code: 'invocation_not_found',
        retryable: false,
      })
      expect(context.runAction).not.toHaveBeenCalled()
      expect(context.runQuery).toHaveBeenCalledTimes(1)
      expect(functionPath(context.runQuery.mock.calls[0]?.[0])).toBe('capabilityCalls:readOwnerRecovery')
    }
  })
  it('projects a persisted needs-authority result when no canonical control exists', async () => {
    const result = {
      kind: 'needs_authority' as const,
      callRef,
      toolRef: row.toolRef,
      authorityRequest: {
        kind: 'approval_required' as const,
        toolRef: row.toolRef,
        consequence: 'read_only' as const,
        retryClass: 'replayable' as const,
        dataFields: [],
      },
    }
    const usage = {
      usageRef: 'usage:authority',
      observedAt: 1_000,
      chargeState: 'free_tier' as const,
      amount: { currency: 'USD', units: '0', exponent: 2 },
      priceDigest: 'sha256:price',
    }
    const persistedRow = {
      ...row,
      result,
      usage,
      evidenceHash: 'sha256:evidence',
      attemptRef: 'attempt:outer',
    }
    const context = workerRecoveryContext(persistedRow)

    await expect(handlerFor(recover)(context, {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'status',
    })).resolves.toEqual({
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'awaiting_authority',
      result,
      usage,
      evidenceHash: 'sha256:evidence',
      attemptRef: 'attempt:outer',
    })
    expect(effectMutationCalls(context)).toHaveLength(0)
    expect(context.runQuery.mock.calls.map(([reference]) => functionPath(reference))).toEqual([
      'capabilityCalls:readRecovery',
      'actionExecutionControl:readControl',
    ])
  })

  it('projects a persisted pre-claim refusal when no canonical control exists', async () => {
    const result = {
      kind: 'refused' as const,
      toolRef: row.toolRef,
      code: 'authority_required',
      retryable: false,
      nextAction: 'Authorize the operation and retry.',
    }
    const context = workerRecoveryContext({ ...row, state: 'refused', result })

    await expect(handlerFor(recover)(context, {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'status',
    })).resolves.toEqual({
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'terminal',
      result,
    })
    expect(effectMutationCalls(context)).toHaveLength(0)
  })

  it('cancels a pre-control pending row durably and replays the cancellation', async () => {
    const context = workerRecoveryContext(row)
    const args = {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'cancel' as const,
      idempotencyKey: 'cancel:pre-control',
    }

    await expect(handlerFor(recover)(context, args)).resolves.toEqual({
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'cancelled',
      result: {
        kind: 'refused',
        toolRef: row.toolRef,
        code: 'invocation_cancelled',
        retryable: false,
      },
    })
    await expect(handlerFor(recover)(context, args)).resolves.toEqual({
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'cancelled',
      result: {
        kind: 'refused',
        toolRef: row.toolRef,
        code: 'invocation_cancelled',
        retryable: false,
      },
    })
    expect(effectMutationCalls(context)).toHaveLength(1)
    expect(functionPath(effectMutationCalls(context)[0]?.[0])).toBe('capabilityCalls:cancelBeforeClaim')
    expect(effectMutationCalls(context)[0]?.[1]).toMatchObject({
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      idempotencyKey: 'cancel:pre-control',
    })
  })
  it('persists the canonical operation reconciliation result on the outer row', async () => {
    const context = projectionContext(row)
    const result = {
      kind: 'reconciliation_required' as const,
      callRef,
      toolRef: row.toolRef,
      evidence: {
        attemptRef: 'attempt:one',
        effectGeneration: 1,
        requiredAt: '2026-08-10T00:00:00.000Z',
        retry: 'reconcile_before_retry' as const,
        evidenceSource: `published-tool:${row.toolRef}`,
      },
    }

    await expect(projectRecoveryHandler(context, {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      state: 'reconciliation_required',
      result,
      clearResult: false,
      clearWorkId: false,
      clearAttemptRef: false,
      clearEvidenceHash: false,
      clearDispatchState: false,
      now: 1_000,
    })).resolves.toEqual({ kind: 'recorded' })
    expect(context.read()).toMatchObject({ state: 'reconciliation_required', result })
  })


  it('keeps persisted reconciliation status honest without canonical uncertain state', async () => {
    const result = {
      kind: 'pending' as const,
      callRef,
      toolRef: row.toolRef,
      retryAfterMs: 1_000,
    }
    const context = workerRecoveryContext({ ...row, result })

    await expect(handlerFor(recover)(context, {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'reconcile',
      evidence,
    })).resolves.toEqual({
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'in_progress',
      result,
    })
    expect(effectMutationCalls(context)).toHaveLength(0)
  })

  it('keeps canonical retryable state authoritative without repairing on status read', async () => {
    const fixture = canonicalFixture({ state: 'retryable', reason: 'pre_release_failure' })
    const staleResult = {
      kind: 'completed' as const,
      callRef,
      toolRef: fixture.row.toolRef,
      output: { stale: true },
      evidenceHash: 'sha256:stale',
      usage: {
        usageRef: 'usage:stale',
        observedAt: 1_000,
        chargeState: 'free_tier' as const,
        amount: { currency: 'USD', units: '0', exponent: 2 },
        priceDigest: 'sha256:price',
      },
    }
    const context = workerRecoveryContext(
      { ...fixture.row, state: 'completed', dispatchState: 'completed', result: staleResult },
      fixture.control,
    )

    await expect(handlerFor(recover)(context, {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'status',
    })).resolves.toEqual({
      kind: 'found',
      callRef,
      toolRef: fixture.row.toolRef,
      state: 'retryable',
      effectGeneration: 1,
      attemptRef: `operation-attempt:${callRef}:1`,
    })
    expect(effectMutationCalls(context)).toHaveLength(0)
  })

  it('projects canonical terminal state without repairing an outer pending row', async () => {
    const fixture = canonicalFixture({ state: 'terminal' })
    const pendingResult = {
      kind: 'pending' as const,
      callRef,
      toolRef: fixture.row.toolRef,
      retryAfterMs: 1_000,
    }
    const context = workerRecoveryContext(
      { ...fixture.row, state: 'pending', dispatchState: 'running', result: pendingResult },
      fixture.control,
    )

    await expect(handlerFor(recover)(context, {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'status',
    })).resolves.toEqual({
      kind: 'found',
      callRef,
      toolRef: fixture.row.toolRef,
      state: 'terminal',
      effectGeneration: 1,
      attemptRef: `operation-attempt:${callRef}:1`,
    })
    expect(effectMutationCalls(context)).toHaveLength(0)
  })


  it('keeps terminal outer rows terminal on cancellation', async () => {
    const result = {
      kind: 'completed' as const,
      callRef,
      toolRef: row.toolRef,
      output: { ok: true },
      evidenceHash: 'sha256:completed',
      usage: {
        usageRef: 'usage:completed',
        observedAt: 2_000,
        chargeState: 'free_tier' as const,
        amount: { currency: 'USD', units: '0', exponent: 2 },
        priceDigest: 'sha256:price',
      },
    }
    const context = workerRecoveryContext({ ...row, state: 'completed', result })

    await expect(handlerFor(recover)(context, {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'cancel',
      idempotencyKey: 'cancel:terminal',
    })).resolves.toMatchObject({
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'terminal',
      result,
    })
    expect(effectMutationCalls(context)).toHaveLength(0)
  })
  it('replays the persisted canonical cancellation after an interrupted outer projection', async () => {
    const fixture = canonicalFixture({ state: 'cancelled', effect: 'not_released' })
    const pendingResult = {
      kind: 'pending' as const,
      callRef,
      toolRef: fixture.row.toolRef,
      retryAfterMs: 1_000,
    }
    const idempotencyKey = 'cancel:interrupted'
    const context = workerRecoveryContext(
      { ...fixture.row, state: 'pending', dispatchState: 'running', result: pendingResult },
      fixture.control,
      { kind: 'none' },
      {
        commandDigest: canonicalDigest({
          format: 'action-invocation-cancel:v1',
          invocationRef: callRef,
          idempotencyKey,
        }),
      },
    )

    const args = {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'cancel' as const,
      idempotencyKey,
    }
    const first = await handlerFor(recover)(context, args)
    expect(first).toEqual({
      kind: 'found',
      callRef,
      toolRef: fixture.row.toolRef,
      state: 'cancelled',
      result: {
        kind: 'refused',
        toolRef: fixture.row.toolRef,
        code: 'invocation_cancelled',
        retryable: false,
      },
    })
    await expect(handlerFor(recover)(context, args)).resolves.toEqual(first)
    const cancelCalls = context.runMutation.mock.calls.filter(
      ([reference]) => functionPath(reference) === 'capabilityCalls:cancelBeforeClaim',
    )
    expect(cancelCalls).toHaveLength(1)
  })

  it('keeps mismatched canonical controls fail-closed', async () => {
    const context = workerRecoveryContext(row, {
      sourceRef: `operation-invocation-source:${callRef}`,
      control: {
        owner: { principalRef: 'principal:other', callerRef: principal.credentialId },
        origin: { kind: 'standalone', principalRef: principal.principalId, callerRef: principal.credentialId },
        executionRef: callRef,
      },
    })

    await expect(handlerFor(recover)(context, {
      callRef,
      principalId: principal.principalId,
      credentialId: principal.credentialId,
      mode: 'status',
    })).resolves.toEqual({
      kind: 'refused',
      callRef,
      code: 'invocation_not_found',
      retryable: false,
    })
    expect(effectMutationCalls(context)).toHaveLength(0)
  })
})
