import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import type { ActionCtx } from '../../../convex/_generated/server'
import type { X402EvmReceipt } from '@/modules/capability-supply/server'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/modules/capability-execution/call-runtime', () => ({ readX402EvmReceipt: rpc }))
import { resolveLostResult, resolveHttpError } from '../../../convex/moneyManagedCallRemedyActions'

const payer = '0x1111111111111111111111111111111111111111'
const payTo = '0x2222222222222222222222222222222222222222'
const asset = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const nonce: Hex = `0x${'a'.repeat(64)}`
const transactionHash: Hex = `0x${'b'.repeat(64)}`
const args = { callRef: 'call:lost', transactionHash }
const attempt = { attemptRef: 'attempt:lost', effectGeneration: 1, toolRef: 'tool:lost',
  inputDigest: 'sha256:input', paymentPayer: payer, paymentNonce: nonce, amountUnits: '1000',
  network: 'eip155:84532', asset, payTo, scheme: 'exact', paymentIdentityDigest: 'sha256:identity',
  paymentIdentifier: 'payment:lost', currency: 'USDC', exponent: 6 }
const call = { callRef: args.callRef, toolRef: attempt.toolRef, inputDigest: attempt.inputDigest,
  environment: 'sandbox', result: { kind: 'reconciliation_required', evidence: {
    attemptRef: attempt.attemptRef, effectGeneration: 1 }, receipt: {
      commercialModel: 'account_aud', totalBuyerCharge: { units: '1404' } } } }
const receipt: X402EvmReceipt = {
  transactionHash, status: 'success', confirmations: 12n, blockHash: `0x${'c'.repeat(64)}`,
  blockNumber: 100n, observedBlockTimestamp: 1_788_120_000n, authorizationState: true, transactionTo: asset,
  transactionInput: encodeFunctionData({ abi: eip3009ABI, functionName: 'transferWithAuthorization',
    args: [payer, payTo, 1000n, 0n, 9_999_999_999n, nonce, 27, `0x${'d'.repeat(64)}`, `0x${'e'.repeat(64)}`] }),
  logs: [{ address: asset, data: encodeAbiParameters([{ type: 'uint256' }], [1000n]),
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: payer, to: payTo } }) as Hex[] }],
}
const handler = (resolveLostResult as unknown as {
  _handler: (ctx: ActionCtx, input: typeof args) => Promise<unknown>
})._handler

function context(httpError = false, financialState = 'outcome_unknown') {
  const retainedAttempt = httpError ? { ...attempt, responseStatus: 500,
    transportObservationDigest: `sha256:${'e'.repeat(64)}`,
    transportRequestDigest: `sha256:${'f'.repeat(64)}`,
    paymentObservationDigest: `sha256:${'1'.repeat(64)}` } : attempt
  const runQuery = vi.fn(async (ref: never) => {
    const name = getFunctionName(ref)
    if (name === 'capabilityCalls:readOwnerRecovery') return call
    if (name === 'moneyX402PaymentAttempts:readX402PaymentAttempt') return retainedAttempt
    if (name === 'moneyManagedCall:readBooking') return { kind: 'available', financialState, booking: { providerAmountUnits: '1000', buyerAmountUnits: '1404' } }
    throw new Error(name)
  })
  const runMutation = vi.fn(async (ref: never) => {
    const name = getFunctionName(ref)
    if (name === 'moneyManagedCallRemedy:claim') return { kind: 'claimed', call, attempt: retainedAttempt }
    if (name === 'moneyManagedCallRemedy:finish') return { kind: 'completed' }
    throw new Error(name)
  })
  const runAction = vi.fn(async (_ref: unknown, _input: unknown) => ({ kind: 'completed', transactionRefs: ['buyer:restored', 'provider:paid'] }))
  return { runQuery, runMutation, runAction }
}

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue(receipt) })

describe('operator recovery for a paid Call with a lost response', () => {
  it('cannot use lost-result recovery to refund a retained 2xx status without JSON', async () => {
    const ctx = context()
    ctx.runQuery.mockImplementation(async ref => {
      const name = getFunctionName(ref)
      if (name === 'capabilityCalls:readOwnerRecovery') return call
      if (name === 'moneyX402PaymentAttempts:readX402PaymentAttempt') return { ...attempt, responseStatus: 200 }
      throw new Error(name)
    })
    expect(await handler(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'refused', code: 'payment_identity_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(ctx.runAction).not.toHaveBeenCalled()
  })
  it('verifies the exact original transfer and restores credit without calling or paying the Provider again', async () => {
    const ctx = context()
    expect(await handler(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'completed' })
    expect(ctx.runAction).toHaveBeenCalledTimes(1)
    expect(getFunctionName(ctx.runAction.mock.calls[0]![0] as never)).toBe('moneyFormance:remedyPaidCall')
    expect(ctx.runMutation.mock.calls.map(([ref]) => getFunctionName(ref))).toEqual([
      'moneyManagedCallRemedy:claim', 'moneyManagedCallRemedy:finish',
    ])
  })
  it.each(['wrong amount', 'wrong transaction', 'unconfirmed'] as const)('makes no ledger changes for %s', async reason => {
    rpc.mockResolvedValue(reason === 'wrong amount'
      ? { ...receipt, logs: [{ ...receipt.logs[0], data: encodeAbiParameters([{ type: 'uint256' }], [2000n]) }] }
      : reason === 'wrong transaction' ? { ...receipt, transactionHash: `0x${'f'.repeat(64)}` }
        : { ...receipt, confirmations: 1n })
    const ctx = context()
    expect(await handler(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'refused', code: 'payment_not_verified' })
    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(ctx.runAction).not.toHaveBeenCalled()
  })
  it('reuses the same financial command after an interrupted receipt update', async () => {
    const ctx = context()
    const finish = ctx.runMutation.getMockImplementation()!
    let interrupted = true
    ctx.runMutation.mockImplementation(async ref => {
      if (getFunctionName(ref) === 'moneyManagedCallRemedy:finish' && interrupted) {
        interrupted = false
        throw new Error('connection interrupted')
      }
      return finish(ref)
    })
    await expect(handler(ctx as unknown as ActionCtx, args)).rejects.toThrow('connection interrupted')
    expect(await handler(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'completed' })
    expect(ctx.runAction.mock.calls[1]).toEqual(ctx.runAction.mock.calls[0])
  })
})


describe('verified paid HTTP error action', () => {
  const resolve = (resolveHttpError as unknown as {
    _handler: (ctx: ActionCtx, input: typeof args) => Promise<unknown>
  })._handler
  it('accepts a 500 status without quarantined JSON and binds response evidence before ledger work', async () => {
    const ctx = context(true)
    expect(await resolve(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'completed' })
    expect(ctx.runAction).toHaveBeenCalledTimes(1)
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failureKind: 'http_error' }))
  })
  it.each([200, undefined, 299, 600, 500.5])('refuses ineligible status %s before chain or ledger work', async status => {
    const ctx = context(true)
    ctx.runQuery.mockImplementation(async ref => {
      const name = getFunctionName(ref)
      if (name === 'capabilityCalls:readOwnerRecovery') return call
      if (name === 'moneyX402PaymentAttempts:readX402PaymentAttempt') return { ...attempt, responseStatus: status,
        transportObservationDigest: `sha256:${'e'.repeat(64)}`,
        transportRequestDigest: `sha256:${'f'.repeat(64)}`,
        paymentObservationDigest: `sha256:${'1'.repeat(64)}` }
      throw new Error(name)
    })
    expect(await resolve(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'refused', code: 'payment_identity_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
    expect(ctx.runAction).not.toHaveBeenCalled()
  })
  it('refuses a status changed between proof and claim without ledger work', async () => {
    const ctx = context(true)
    ctx.runMutation.mockResolvedValueOnce({ kind: 'claimed', call, attempt: { ...attempt, responseStatus: 503 } })
    expect(await resolve(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'refused', code: 'payment_identity_changed' })
    expect(ctx.runAction).not.toHaveBeenCalled()
  })
  it('refuses a foreign chain transaction before claiming or ledger work', async () => {
    rpc.mockResolvedValue({ ...receipt, transactionHash: `0x${'f'.repeat(64)}` })
    const ctx = context(true)
    expect(await resolve(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'refused', code: 'payment_not_verified' })
    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(ctx.runAction).not.toHaveBeenCalled()
  })
  it('requires original transaction proof and a still-held booking before the buyer release recipe', async () => {
    const captured = context(true, 'settled')
    expect(await resolve(captured as unknown as ActionCtx, args)).toEqual({ kind: 'refused', code: 'booking_unavailable' })
    expect(captured.runAction).not.toHaveBeenCalled()
    rpc.mockResolvedValue({ ...receipt, confirmations: 0n })
    const unverified = context(true)
    expect(await resolve(unverified as unknown as ActionCtx, args)).toEqual({ kind: 'refused', code: 'payment_not_verified' })
    expect(unverified.runMutation).not.toHaveBeenCalled()
    expect(unverified.runAction).not.toHaveBeenCalled()
  })
  it.each(['ledger', 'receipt'] as const)('resumes the identical remedy after interrupted %s finalization', async boundary => {
    const ctx = context(true)
    if (boundary === 'ledger') ctx.runAction.mockRejectedValueOnce(new Error('interrupted'))
    else {
      const mutation = ctx.runMutation.getMockImplementation()!
      let first = true
      ctx.runMutation.mockImplementation(async ref => {
        if (getFunctionName(ref) === 'moneyManagedCallRemedy:finish' && first) {
          first = false
          throw new Error('interrupted')
        }
        return mutation(ref)
      })
    }
    await expect(resolve(ctx as unknown as ActionCtx, args)).rejects.toThrow('interrupted')
    expect(await resolve(ctx as unknown as ActionCtx, args)).toEqual({ kind: 'completed' })
    expect(ctx.runAction.mock.calls[1]).toEqual(ctx.runAction.mock.calls[0])
    expect(getFunctionName(ctx.runAction.mock.calls[0]![0] as never)).toBe('moneyFormance:remedyPaidCall')
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ failureKind: 'http_error' }))
  })
})
