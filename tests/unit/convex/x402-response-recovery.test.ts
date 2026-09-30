import { describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { getFunctionName } from 'convex/server'
import { recoverRetainedResponse } from '../../../convex/moneyX402ResponseActions'
import type { ActionCtx } from '../../../convex/_generated/server'

const loading = vi.hoisted(() => vi.fn())
const reconcile = vi.hoisted(() => vi.fn())
vi.mock('@/modules/capability-execution/call-worker/recovery/loading', () => ({ loadReadyRecoveryWork: loading }))
vi.mock('@/modules/capability-execution/call-worker/recovery/reconciliation', () => ({ reconcileRecovery: reconcile }))

function fixture() {
  const now = Date.now()
  const requestDigest = canonicalDigest('original-request')
  const paymentResponseDigest = canonicalDigest('original-payment-response')
  const transactionHash = `0x${'a'.repeat(64)}`
  const work = {
    recovered: { callRef: 'call:one', toolRef: 'tool:one', inputDigest: 'sha256:input' },
    operation: { operationId: 'tool:one', binding: { authority: { kind: 'provider_connection', providerRef: 'provider:one' } } },
    control: { control: { control: { state: 'reconciliation_required' } } },
    attemptRows: [{ attemptRef: 'attempt:one', effectGeneration: 1,
      outcome: { state: 'uncertain', reconciliationRequiredAt: new Date(now - 1_000).toISOString() } }],
    x402Attempt: { attemptRef: 'attempt:one', effectGeneration: 1, reservationRef: 'reservation:one',
      responseStatus: 200 as number | undefined,
      quarantinedOutputJson: '{"result":"weather"}' as string | undefined, quarantinedResponseDigest: canonicalDigest('response') as string | undefined,
      network: 'eip155:84532', evidenceRefs: [`chain:eip155:84532:${transactionHash}`,
        `response-request:${requestDigest}`, `response-payment:${paymentResponseDigest}`],
      amountUnits: '1000', currency: 'USDC', exponent: 6, paymentIdentifier: 'payment:one',
      challengeDigest: 'sha256:challenge', preparedAt: now - 10_000 },
  }
  loading.mockResolvedValue({ kind: 'ready', work })
  reconcile.mockReset().mockResolvedValue({ kind: 'found', result: { kind: 'completed', output: { result: 'weather' } } })
  const calls: Array<{ path: string; args: unknown }> = []
  const ctx = {
    runQuery: vi.fn(async () => ({ callRef: 'call:one', principalId: 'principal:one', credentialId: 'credential:one' })),
    runMutation: vi.fn(async (ref, args) => { calls.push({ path: getFunctionName(ref), args }); return null }),
    runAction: vi.fn(),
  } as unknown as ActionCtx
  return { ctx, work, calls, requestDigest, paymentResponseDigest, transactionHash }
}

describe('automatic retained x402 response recovery', () => {
  it('reconstructs an interrupted observation from its checkpoint and passes exact original evidence to verified recovery', async () => {
    const { ctx, calls, requestDigest, paymentResponseDigest, transactionHash } = fixture()
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'completed' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ path: 'moneyX402PaymentAttempts:recordX402PaymentObservation', args: {
      dispatchRef: 'call:one', attemptRef: 'attempt:one', settlementStatus: 'unknown',
      transportRequestDigest: requestDigest, paymentResponseDigest,
    } })
    expect(reconcile).toHaveBeenCalledWith(ctx, expect.objectContaining({
      callRef: 'call:one', evidence: expect.objectContaining({
        source: 'published-tool:tool:one', requestDigest, paymentResponseDigest,
        transactionHash, settlementStatus: 'settled', amount: { units: '1000', currency: 'USDC', exponent: 6 },
      }),
    }))
    expect(ctx.runAction).not.toHaveBeenCalled()
  })

  it('retains exactly the same recovery evidence after a crash following financial settlement', async () => {
    const { ctx } = fixture()
    reconcile.mockRejectedValueOnce(new Error('projection interrupted'))
    await expect(recoverRetainedResponse(ctx, 'call:one')).rejects.toThrow('projection interrupted')
    const first = reconcile.mock.calls[0]![1]
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'completed' })
    expect(reconcile.mock.calls[1]![1]).toEqual(first)
  })

  it('routes a retained paid HTTP error without JSON to the exact-Call remedy', async () => {
    const { ctx, work, transactionHash } = fixture()
    work.x402Attempt.responseStatus = 500
    work.x402Attempt.quarantinedOutputJson = undefined
    work.x402Attempt.quarantinedResponseDigest = undefined
    vi.mocked(ctx.runAction).mockResolvedValue({ kind: 'completed' })
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'completed' })
    expect(getFunctionName(vi.mocked(ctx.runAction).mock.calls[0]![0])).toBe('moneyManagedCallRemedyActions:resolveHttpError')
    expect(vi.mocked(ctx.runAction).mock.calls[0]![1]).toEqual({ callRef: 'call:one', transactionHash })
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('keeps HTTP-error recovery pending when its financial remedy is not complete', async () => {
    const { ctx, work } = fixture()
    work.x402Attempt.responseStatus = 500
    vi.mocked(ctx.runAction).mockResolvedValue({ kind: 'refused', code: 'credit_restoration_pending' })
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'pending' })
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('replays the same HTTP-error remedy after a partial-ledger failure without capturing a buyer charge', async () => {
    const { ctx, work, transactionHash } = fixture()
    work.x402Attempt.responseStatus = 500
    work.x402Attempt.quarantinedOutputJson = undefined
    work.x402Attempt.quarantinedResponseDigest = undefined
    vi.mocked(ctx.runAction).mockResolvedValueOnce({ kind: 'refused', code: 'credit_restoration_pending' })
      .mockResolvedValueOnce({ kind: 'completed' })
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'pending' })
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'completed' })
    expect(vi.mocked(ctx.runAction).mock.calls.map(([, args]) => args)).toEqual([
      { callRef: 'call:one', transactionHash }, { callRef: 'call:one', transactionHash },
    ])
    expect(reconcile).not.toHaveBeenCalled()
  })


  it('recovers a malformed settled 2xx without JSON as a paid delivery refusal', async () => {
    const { ctx, work, calls } = fixture()
    work.x402Attempt.quarantinedOutputJson = undefined
    work.x402Attempt.quarantinedResponseDigest = undefined
    reconcile.mockResolvedValue({ kind: 'found', result: { kind: 'refused', receipt: { state: 'settled' } } })
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'completed' })
    expect(calls[0]).toMatchObject({ args: { responseStatus: 200 } })
    expect(reconcile).toHaveBeenCalledOnce()
    expect(ctx.runAction).not.toHaveBeenCalled()
  })

  it.each([undefined, 199, 200.5, 600])('holds recovery with a missing or invalid paid status: %s', async responseStatus => {
    const { ctx, work } = fixture()
    work.x402Attempt.responseStatus = responseStatus
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'stopped' })
    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(ctx.runAction).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('does not recover a response without an original transaction locator', async () => {
    const { ctx, work } = fixture()
    work.x402Attempt.evidenceRefs = []
    await expect(recoverRetainedResponse(ctx, 'call:one')).resolves.toEqual({ kind: 'stopped' })
    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
  })
})
