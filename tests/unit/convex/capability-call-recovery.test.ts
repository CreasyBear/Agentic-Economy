import { describe, expect, it, vi } from 'vitest'
import { reconcileCall, reconcileOwnerCall } from '../../../convex/capabilityCalls'
import { ownerCallStatusResultSchema } from '@/modules/capability-execution/call-recovery.actions'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  callRef,
  canonicalFixture,
  canonicalStatusFound,
  effectMutationCalls,
  evidence,
  expectAgentRecoverWorkerAction,
  expectNoEffectMutations,
  expectOwnerHandlersRefuse,
  expectOwnerRecoverAction,
  expectReadOwnerRecoveryQuery,
  expectWorkerRecover,
  foundCancelled,
  foundWorkerResult,
  freeTierUsage,
  functionPath,
  invocationNotFound,
  invokeAgentRecoveryHandler,
  invokeOwnerRecoveryHandler,
  ownerIdentity,
  ownerRecoveryContext,
  pendingResult,
  principal,
  projectionContext,
  projectRecoveryHandler,
  projectRecoveryMutationArgs,
  readOwnerCallStatusHandler,
  recoverHandler,
  recoveryArgs,
  recoveryContext,
  row,
  workerRecoverArgs,
  workerRecoveryContext,
  type AuthIdentity,
} from '../../helpers/capability-call-recovery-harness'

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

const x402EvidenceFields = [
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
] as const

describe('capability operation recovery Convex adapters', () => {
  it('admits the exact x402 reconciliation evidence object in both public Convex actions', () => {
    for (const action of [reconcileCall, reconcileOwnerCall]) {
      const registered = action as unknown as { exportArgs(): string }
      const args = JSON.parse(registered.exportArgs()) as {
        value: Record<string, { fieldType: { type: string; value?: Array<{ type: string; value: Record<string, unknown> }> } }>
      }
      const evidenceShape = args.value.evidence?.fieldType
      expect(evidenceShape?.type).toBe('union')
      const x402 = evidenceShape?.value?.find((member) => {
        if (member.type !== 'object') return false
        const kind = member.value.kind as { fieldType?: { value?: unknown } } | undefined
        return kind?.fieldType?.value === 'x402_payment_reconciliation'
      })
      expect(Object.keys(x402?.value ?? {}).sort()).toEqual([...x402EvidenceFields])
    }
  })

  it('hands status and remedies to the worker with original effect identity after credential replacement', async () => {
    const successor = { ...principal, credentialId: 'credential:successor' }
    const cases = [
      {
        mode: 'status' as const,
        grant: null as Readonly<{ generation: number }> | null,
        workerState: 'in_progress',
        args: {} as Record<string, unknown>,
        expected: { state: 'in_progress' },
        actionExtra: {},
      },
      {
        mode: 'cancel' as const,
        grant: { generation: row.grantGeneration + 1 },
        workerState: 'cancelled',
        args: { idempotencyKey: 'cancel:one' },
        expected: { state: 'cancelled' },
        actionExtra: { idempotencyKey: 'cancel:one' },
      },
      {
        mode: 'reconcile' as const,
        grant: { generation: row.grantGeneration + 1 },
        workerState: 'terminal',
        args: { idempotencyKey: 'reconcile:one', evidence },
        expected: { state: 'terminal' },
        actionExtra: { evidence },
      },
    ] as const

    const contexts = cases.map((testCase) => ({
      context: recoveryContext({
        row,
        grant: testCase.grant,
        workerResult: foundWorkerResult(testCase.workerState),
      }),
      testCase,
    }))

    for (const { context, testCase } of contexts) {
      await expect(invokeAgentRecoveryHandler(
        testCase.mode,
        context,
        recoveryArgs({ principal: successor, ...testCase.args }),
      )).resolves.toMatchObject(testCase.expected)
      expectAgentRecoverWorkerAction(context, testCase.mode, successor, testCase.actionExtra)
      expect(context.runMutation).toHaveBeenCalledTimes(2)
    }

    for (const { context } of contexts) {
      expectReadOwnerRecoveryQuery(context)
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
      ownerContext: { reconciliation: { canSubmitEvidence: true, permissionBasis: 'account_owner', requiresVerifiedEvidence: true } },
    })
    expectOwnerRecoverAction(statusContext, 'status')

    const cancelContext = ownerRecoveryContext(ownerIdentity, foundWorkerResult('cancelled'), ownerRow)
    await expect(invokeOwnerRecoveryHandler('cancel', cancelContext, {
      callRef,
      idempotencyKey: 'cancel:owner:one',
    })).resolves.toMatchObject({ kind: 'found', state: 'cancelled' })
    expectOwnerRecoverAction(cancelContext, 'cancel', { idempotencyKey: 'cancel:owner:one' })

    const reconcileContext = ownerRecoveryContext(ownerIdentity, foundWorkerResult('terminal'), ownerRow)
    await expect(invokeOwnerRecoveryHandler('reconcile', reconcileContext, {
      callRef,
      idempotencyKey: 'reconcile:owner:one',
      evidence,
    })).resolves.toMatchObject({ kind: 'found', state: 'terminal' })
    expectOwnerRecoverAction(reconcileContext, 'reconcile', { evidence })
  })

  it('retains readable status when optional owner context cannot be read', async () => {
    const ctx = ownerRecoveryContext(ownerIdentity, foundWorkerResult('reconciliation_required'))
    ctx.runQuery.mockImplementation(async (reference: unknown) => {
      if (functionPath(reference) === 'capabilityCalls:readOwnerRecovery') return row
      if (functionPath(reference) === 'capabilityCalls:readPurchaseResolution') return null
      if (functionPath(reference) === 'capabilityCalls:readOwnerReceiptContext') throw new Error('source unavailable')
      throw new Error(`unexpected_owner_query:${functionPath(reference)}`)
    })
    await expect(readOwnerCallStatusHandler(ctx, { callRef })).resolves.toMatchObject({
      kind: 'found', callRef, state: 'reconciliation_required', ownerContext: null,
    })
  })

  it('projects a recorded terminal refusal instead of a stale retryable kernel status', async () => {
    const amount = { currency: 'AUD' as const, units: '1403', exponent: 6 as const }
    const providerAmount = { currency: 'USDC' as const, units: '1000', exponent: 6 as const }
    const receipt = {
      receiptRef: 'receipt:terminal-refusal', state: 'refunded' as const,
      priceDigest: 'sha256:price', transactionRef: 'formance:reservation',
      accountingTransactionRefs: ['formance:reservation'], refundState: 'released' as const,
      lossState: 'none' as const, evidenceHash: 'sha256:evidence',
      issuedAt: '2026-09-22T06:46:37.107Z', commercialModel: 'account_aud' as const,
      buyerCharge: amount, serviceFee: { ...amount, units: '0' }, totalBuyerCharge: amount,
      providerObligation: { amount: providerAmount, settlementMethod: 'managed_x402' as const, payoutEligible: false as const },
      providerSettlement: {
        amount: providerAmount, network: 'eip155:84532' as const,
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
      },
    }
    const result = {
      kind: 'refused' as const, toolRef: row.toolRef,
      code: 'payment_requirement_outside_authority', retryable: false, receipt,
    }
    const terminalRow = {
      ...row, state: 'refused' as const, result,
      usage: { ...freeTierUsage('usage:refunded', 2), chargeState: 'refunded' as const, amount },
      evidenceHash: receipt.evidenceHash, updatedAt: 3,
    }
    const ctx = ownerRecoveryContext(ownerIdentity, foundWorkerResult('retryable'), terminalRow)

    const projected = await readOwnerCallStatusHandler(ctx, { callRef })
    expect(projected).toMatchObject({
      kind: 'found', state: 'terminal', version: 3,
      result: { ...result, code: 'pre_release_failed' }, receipt,
      usage: { chargeState: 'refunded' }, evidenceHash: receipt.evidenceHash,
    })
    expect(ownerCallStatusResultSchema.parse(projected)).toEqual(projected)
    expect(ctx.runAction).not.toHaveBeenCalled()
  })

  it('keeps a recorded retryable refusal on the canonical worker status path', async () => {
    const retryableRow = {
      ...row, state: 'refused' as const,
      result: { kind: 'refused' as const, toolRef: row.toolRef, code: 'source_unavailable', retryable: true },
      updatedAt: 3,
    }
    const ctx = ownerRecoveryContext(ownerIdentity, foundWorkerResult('retryable'), retryableRow)

    await expect(readOwnerCallStatusHandler(ctx, { callRef })).resolves.toMatchObject({
      kind: 'found', state: 'retryable',
    })
    expectOwnerRecoverAction(ctx, 'status')
  })

  it('returns not-found without recovery work for a foreign or unauthenticated Clerk session', async () => {
    for (const identity of [
      { subject: 'user_123', tokenIdentifier: 'clerk|other' },
      { subject: 'owner:other', tokenIdentifier: 'clerk|owner:other' },
      null,
    ] as const) {
      await expectOwnerHandlersRefuse(ownerRecoveryContext(identity, foundWorkerResult('terminal')))
    }
  })

  it('projects reconciliation-required status without hiding the invocation', async () => {
    const context = recoveryContext({
      row,
      grant: null,
      workerResult: { kind: 'reconciliation_required', callRef, toolRef: row.toolRef, evidence },
    })
    await expect(invokeAgentRecoveryHandler('status', context, recoveryArgs())).resolves.toMatchObject({
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
        workerResult: foundWorkerResult('in_progress'),
      })

      await expect(invokeAgentRecoveryHandler('status', context, recoveryArgs({
        principal: wrongPrincipal,
      }))).resolves.toEqual(invocationNotFound)
      expect(context.runAction).not.toHaveBeenCalled()
      expectReadOwnerRecoveryQuery(context)
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
    const usage = freeTierUsage('usage:authority', 1_000)
    const context = workerRecoveryContext({
      ...row,
      result,
      usage,
      evidenceHash: 'sha256:evidence',
      attemptRef: 'attempt:outer',
    })

    await expectWorkerRecover(context, 'status', {
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'awaiting_authority',
      result,
      usage,
      evidenceHash: 'sha256:evidence',
      attemptRef: 'attempt:outer',
    })
    expectNoEffectMutations(context)
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

    await expectWorkerRecover(context, 'status', {
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'terminal',
      result,
    })
    expectNoEffectMutations(context)
  })

  it('cancels a pre-control pending row durably and replays the cancellation', async () => {
    const context = workerRecoveryContext(row)
    const args = workerRecoverArgs('cancel', { idempotencyKey: 'cancel:pre-control' })
    const expected = foundCancelled(row.toolRef)

    await expect(recoverHandler(context, args)).resolves.toEqual(expected)
    await expect(recoverHandler(context, args)).resolves.toEqual(expected)
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

    await expect(projectRecoveryHandler(context, projectRecoveryMutationArgs(result))).resolves.toEqual({ kind: 'recorded' })
    expect(context.read()).toMatchObject({ state: 'reconciliation_required', result })
  })

  it('keeps persisted reconciliation status honest without canonical uncertain state', async () => {
    const result = pendingResult(row.toolRef)
    const context = workerRecoveryContext({ ...row, result })

    await expectWorkerRecover(context, 'reconcile', {
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'in_progress',
      result,
    }, { evidence })
    expectNoEffectMutations(context)
  })

  it.each([
    {
      title: 'keeps canonical retryable state authoritative without repairing on status read',
      control: { state: 'retryable', reason: 'pre_release_failure' } as const,
      outerState: 'completed' as const,
      dispatchState: 'completed' as const,
      buildResult: (toolRef: string) => ({
        kind: 'completed' as const,
        callRef,
        toolRef,
        output: { stale: true },
        evidenceHash: 'sha256:stale',
        usage: freeTierUsage('usage:stale', 1_000),
      }),
      projectedState: 'retryable',
    },
    {
      title: 'projects canonical terminal state without repairing an outer pending row',
      control: { state: 'terminal' } as const,
      outerState: 'pending' as const,
      dispatchState: 'running' as const,
      buildResult: (toolRef: string) => pendingResult(toolRef),
      projectedState: 'terminal',
    },
  ])('$title', async ({ control, outerState, dispatchState, buildResult, projectedState }) => {
    const fixture = canonicalFixture(control)
    const context = workerRecoveryContext(
      {
        ...fixture.row,
        state: outerState,
        dispatchState,
        result: buildResult(fixture.row.toolRef),
      },
      fixture.control,
    )

    await expectWorkerRecover(context, 'status', canonicalStatusFound(fixture.row.toolRef, projectedState))
    expectNoEffectMutations(context)
  })

  it('keeps terminal outer rows terminal on cancellation', async () => {
    const result = {
      kind: 'completed' as const,
      callRef,
      toolRef: row.toolRef,
      output: { ok: true },
      evidenceHash: 'sha256:completed',
      usage: freeTierUsage('usage:completed', 2_000),
    }
    const context = workerRecoveryContext({ ...row, state: 'completed', result })

    await expectWorkerRecover(context, 'cancel', {
      kind: 'found',
      callRef,
      toolRef: row.toolRef,
      state: 'terminal',
      result,
    }, { idempotencyKey: 'cancel:terminal' }, 'matchObject')
    expectNoEffectMutations(context)
  })

  it('replays the persisted canonical cancellation after an interrupted outer projection', async () => {
    const fixture = canonicalFixture({ state: 'cancelled', effect: 'not_released' })
    const idempotencyKey = 'cancel:interrupted'
    const context = workerRecoveryContext(
      {
        ...fixture.row,
        state: 'pending',
        dispatchState: 'running',
        result: pendingResult(fixture.row.toolRef),
      },
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

    const args = workerRecoverArgs('cancel', { idempotencyKey })
    const first = await recoverHandler(context, args)
    expect(first).toEqual(foundCancelled(fixture.row.toolRef))
    await expect(recoverHandler(context, args)).resolves.toEqual(first)
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

    await expectWorkerRecover(context, 'status', invocationNotFound)
    expectNoEffectMutations(context)
  })
})
