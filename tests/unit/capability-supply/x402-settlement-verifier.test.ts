import {
  eip3009ABI,
} from '@x402/evm'
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  type Hex,
} from 'viem'
import { describe, expect, it } from 'vitest'

import {
  verifyExactEvmX402Settlement,
  type X402EvmReceipt,
} from '@/modules/capability-supply/internal/x402-settlement-verifier'

const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const payer = '0x0000000000000000000000000000000000000002'
const payTo = '0x0000000000000000000000000000000000000003'
const nonce: Hex = `0x${'a'.repeat(64)}`
const transaction: Hex = `0x${'4'.repeat(64)}`
const blockHash: Hex = `0x${'5'.repeat(64)}`
const amount = 10_000n

const calldata = encodeFunctionData({
  abi: eip3009ABI,
  functionName: 'transferWithAuthorization',
  args: [
    payer,
    payTo,
    amount,
    0n,
    9_999_999_999n,
    nonce,
    27,
    `0x${'b'.repeat(64)}`,
    `0x${'c'.repeat(64)}`,
  ],
})

const transfer: Readonly<{ data: Hex; topics: readonly Hex[] }> = {
  data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
  topics: encodeEventTopics({
    abi: erc20Abi,
    eventName: 'Transfer',
    args: { from: payer, to: payTo },
  }) as readonly Hex[],
}
const conflictingTransfer: Readonly<{ data: Hex; topics: readonly Hex[] }> = {
  data: encodeAbiParameters([{ type: 'uint256' }], [amount + 1n]),
  topics: encodeEventTopics({
    abi: erc20Abi,
    eventName: 'Transfer',
    args: { from: payer, to: payTo },
  }) as readonly Hex[],
}
const requirement = {
  scheme: 'exact',
  network: 'eip155:8453',
  amount: amount.toString(),
  asset,
  payTo,
} as const
const response = {
  success: true,
  transaction,
  network: requirement.network,
  amount: requirement.amount,
  payer,
} as const
const receipt: X402EvmReceipt = {
  transactionHash: transaction,
  status: 'success',
  confirmations: 12n,
  blockHash,
  blockNumber: 100n,
  authorizationState: true,
  transactionTo: asset,
  transactionInput: calldata,
  logs: [{ address: asset, data: transfer.data, topics: transfer.topics }],
}

describe('x402 EVM settlement verification', () => {
  it('accepts only the exact authorization, transfer, and authorization-state proof', () => {
    expect(verifyExactEvmX402Settlement({
      response,
      requirement,
      payer,
      paymentNonce: nonce,
      receipt,
    })).toBe(true)
  })

  type SettlementInput = Parameters<typeof verifyExactEvmX402Settlement>[0]
  type SettlementOverrides = Partial<SettlementInput>
  const rejectionCases: readonly (readonly [string, SettlementOverrides])[] = [
    ['false authorization state', { receipt: { ...receipt, authorizationState: false } }],
    ['missing authorization state', { receipt: { ...receipt, authorizationState: undefined } as unknown as X402EvmReceipt }],
    ['historical transfer has wrong nonce', { paymentNonce: `0x${'d'.repeat(64)}` }],
    ['wrong calldata', { receipt: { ...receipt, transactionInput: encodeFunctionData({
      abi: eip3009ABI,
      functionName: 'transferWithAuthorization',
      args: [payer, payTo, amount, 0n, 9_999_999_999n, `0x${'d'.repeat(64)}`, 27, `0x${'b'.repeat(64)}`, `0x${'c'.repeat(64)}`],
    }) } }],
    ['correct authorization has wrong transfer', { receipt: { ...receipt, logs: [
      { address: payTo, data: transfer.data, topics: transfer.topics },
    ] } }],
    ['conflicting transfer', { receipt: { ...receipt, logs: [
      { address: asset, data: transfer.data, topics: transfer.topics },
      { address: asset, data: conflictingTransfer.data, topics: conflictingTransfer.topics },
    ] } }],
    ['wrong asset', { requirement: { ...requirement, asset: payTo } }],
    ['wrong network', { response: { ...response, network: 'eip155:1' } }],
    ['wrong payer', { payer: payTo }],
    ['wrong hash', { response: { ...response, transaction: `0x${'5'.repeat(64)}` } }],
    ['missing block identity', { receipt: { ...receipt, blockHash: undefined, blockNumber: undefined } as unknown as X402EvmReceipt }],
    ['reverted receipt', { receipt: { ...receipt, status: 'reverted' as const } }],
    ['insufficient confirmations', { receipt: { ...receipt, confirmations: 11n } }],
  ]

  it.each(rejectionCases)('%s is rejected', (_label, overrides) => {
    expect(verifyExactEvmX402Settlement({
      response: overrides.response ?? response,
      requirement: overrides.requirement ?? requirement,
      payer: overrides.payer ?? payer,
      paymentNonce: overrides.paymentNonce ?? nonce,
      receipt: overrides.receipt ?? receipt,
    })).toBe(false)
  })
})
