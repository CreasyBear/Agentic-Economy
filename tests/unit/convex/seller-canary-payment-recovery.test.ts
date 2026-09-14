import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_ADDRESS } from '@/modules/capability-supply/public'
import { prepareX402RecoveryEvidence } from '@/modules/capability-execution/call-worker/recovery/x402'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/modules/action-execution/runtime', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  readPublicExecutionStatus: vi.fn(async () => ({ kind: 'found', control: 'reconciliation_required' })),
}))
vi.mock('@/modules/capability-execution/call-worker/x402Route', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(), readX402EvmReceipt: rpc,
}))

const payer = '0x0000000000000000000000000000000000000002'
const payTo = '0x0000000000000000000000000000000000000003'
const nonce: Hex = `0x${'a'.repeat(64)}`
const transaction: Hex = `0x${'4'.repeat(64)}`
const asset = BASE_SEPOLIA_USDC_ADDRESS

function confirmedReceipt() {
  return {
    transactionHash: transaction, status: 'success', confirmations: 12n,
    blockHash: `0x${'5'.repeat(64)}`, blockNumber: 100n,
    observedBlockTimestamp: 1_788_120_000n, authorizationState: true,
    transactionTo: asset,
    transactionInput: encodeFunctionData({
      abi: eip3009ABI, functionName: 'transferWithAuthorization',
      args: [payer, payTo, 1n, 0n, 9_999_999_999n, nonce, 27, `0x${'b'.repeat(64)}`, `0x${'c'.repeat(64)}`],
    }),
    logs: [{ address: asset,
      data: encodeAbiParameters([{ type: 'uint256' }], [1n]),
      topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: payer, to: payTo } }),
    }],
  }
}

function fixture() {
  const material = {
    kind: 'x402_payment_reconciliation' as const, version: 1 as const,
    evidenceRef: 'evidence:validation', source: 'published-tool:validation',
    invocationRef: 'call:validation', attemptRef: 'attempt:validation', effectGeneration: 1,
    operationRef: 'tool:validation', inputDigest: canonicalDigest('input'),
    requestDigest: canonicalDigest('request'), transportObservationDigest: canonicalDigest('transport'),
    paymentObservationDigest: canonicalDigest('payment'), providerRef: 'provider:validation',
    paymentIdentifier: canonicalDigest('payment-identity'), challengeDigest: canonicalDigest('challenge'),
    amount: { currency: 'USD', exponent: 6, units: '1' },
    settlementStatus: 'settled' as const, paymentResponseDigest: canonicalDigest('response'),
    transactionHash: transaction, observedAt: '2026-09-14T00:00:00.000Z',
  }
  const evidence = { ...material, digest: canonicalDigest(material) }
  const work = {
    recovered: {
      callRef: material.invocationRef, toolRef: material.operationRef,
      inputDigest: material.inputDigest, credentialId: 'platform-credential', principalId: 'platform-principal',
      environment: 'sandbox', sellerOnboardingCanary: { executionPurpose: 'seller_onboarding_canary' },
    },
    operation: {
      identity: { adapterId: 'x402-fetch:v2' },
      binding: { authority: { kind: 'provider_connection', providerRef: material.providerRef } },
    },
    x402Attempt: {
      attemptRef: material.attemptRef, effectGeneration: 1, paymentIdentifier: material.paymentIdentifier,
      challengeDigest: material.challengeDigest, amountUnits: '1', currency: 'USD', exponent: 6,
      paymentPayer: payer, paymentNonce: nonce, scheme: 'exact', network: BASE_SEPOLIA_NETWORK, asset, payTo,
    },
    managedReservation: null, port: {}, trustedReconciliationEvidenceDigest: { value: undefined },
    brokeredReceipt: vi.fn(() => undefined),
  }
  const ctx = {
    runMutation: vi.fn(async () => ({ kind: 'settled', settlementStatus: 'settled' })),
    runAction: vi.fn(async () => { throw new Error('unexpected_buyer_money_effect') }),
  }
  return { ctx, work, evidence }
}

describe('platform validation payment recovery', () => {
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue(confirmedReceipt()) })

  it('verifies the exact testnet receipt and reconciles without buyer funds', async () => {
    const { ctx, work, evidence } = fixture()
    const result = await prepareX402RecoveryEvidence(ctx as never, work as never, evidence)
    expect(result).toMatchObject({ kind: 'prepared', evidence: { resolution: 'released', paymentIdentifier: evidence.paymentIdentifier } })
    expect(ctx.runMutation).toHaveBeenCalledTimes(1)
    const [reference, command] = ctx.runMutation.mock.calls[0]! as unknown as [Parameters<typeof getFunctionName>[0], Record<string, unknown>]
    expect(getFunctionName(reference)).toBe('moneyX402PaymentAttempts:reconcileSellerOnboardingCanaryPaymentAttempt')
    expect(command).not.toHaveProperty('reservationRef')
    expect(ctx.runAction).not.toHaveBeenCalled()
    expect(work.brokeredReceipt).toHaveBeenLastCalledWith('settled', expect.any(String), evidence.observedAt,
      transaction, transaction, evidence.paymentIdentifier, 'not_applicable', 'none')
  })

  it.each(['missing receipt', 'insufficient confirmations', 'wrong nonce', 'mainnet', 'wrong input', 'buyer reservation'] as const)(
    'keeps %s unresolved without a money mutation', async (change) => {
      const { ctx, work, evidence } = fixture()
      if (change === 'missing receipt') rpc.mockResolvedValue(undefined)
      if (change === 'insufficient confirmations') rpc.mockResolvedValue({ ...confirmedReceipt(), confirmations: 11n })
      if (change === 'wrong nonce') work.x402Attempt.paymentNonce = `0x${'d'.repeat(64)}`
      if (change === 'mainnet') work.x402Attempt.network = 'eip155:8453' as typeof BASE_SEPOLIA_NETWORK
      if (change === 'wrong input') work.recovered.inputDigest = canonicalDigest('other')
      const submitted = change === 'buyer reservation' ? { ...evidence, reservationRef: 'buyer:reservation' } : evidence
      expect(await prepareX402RecoveryEvidence(ctx as never, work as never, submitted)).toMatchObject({ kind: 'required' })
      expect(ctx.runMutation).not.toHaveBeenCalled()
      expect(ctx.runAction).not.toHaveBeenCalled()
    },
  )

  it('keeps a verified transfer unresolved when durable reconciliation refuses it', async () => {
    const { ctx, work, evidence } = fixture()
    ctx.runMutation.mockResolvedValue({ kind: 'reconciliation_required' } as never)
    expect(await prepareX402RecoveryEvidence(ctx as never, work as never, evidence)).toMatchObject({ kind: 'required' })
    expect(work.trustedReconciliationEvidenceDigest.value).toBeUndefined()
    expect(ctx.runAction).not.toHaveBeenCalled()
  })

  it('continues requiring a reservation for ordinary buyer payment evidence', async () => {
    const { ctx, work, evidence } = fixture()
    const buyer = { ...work, recovered: { ...work.recovered, sellerOnboardingCanary: undefined } }
    expect(await prepareX402RecoveryEvidence(ctx as never, buyer as never, evidence)).toMatchObject({ kind: 'required' })
    expect(ctx.runMutation).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
