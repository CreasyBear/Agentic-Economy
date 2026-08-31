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
import {
  BASE_MAINNET_NETWORK,
  BASE_MAINNET_USDC_ADDRESS,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  type X402AeEnvironment,
} from '@/modules/capability-supply/public'

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
function settlementFixture(
  aeEnvironment: X402AeEnvironment,
): Parameters<typeof verifyExactEvmX402Settlement>[0] {
  const network = aeEnvironment === 'sandbox'
    ? BASE_SEPOLIA_NETWORK
    : BASE_MAINNET_NETWORK
  const asset = aeEnvironment === 'sandbox'
    ? BASE_SEPOLIA_USDC_ADDRESS
    : BASE_MAINNET_USDC_ADDRESS
  return {
    aeEnvironment,
    response: {
      success: true,
      transaction,
      network,
      amount: amount.toString(),
      payer,
    },
    requirement: {
      scheme: 'exact',
      network,
      amount: amount.toString(),
      asset,
      payTo,
    },
    payer,
    paymentNonce: nonce,
    receipt: {
      transactionHash: transaction,
      status: 'success',
      confirmations: 12n,
      blockHash,
      blockNumber: 100n,
      observedBlockTimestamp: 1_788_120_000n,
      authorizationState: true,
      transactionTo: asset,
      transactionInput: calldata,
      logs: [{ address: asset, data: transfer.data, topics: transfer.topics }],
    },
  }
}

describe('x402 EVM settlement verification', () => {
  it.each([
    ['production Base USDC', 'production'],
    ['sandbox Base Sepolia USDC', 'sandbox'],
  ] as const)('accepts the exact %s profile and its full settlement proof', (_label, aeEnvironment) => {
    expect(verifyExactEvmX402Settlement(settlementFixture(aeEnvironment))).toBe(true)
  })

  type SettlementInput = Parameters<typeof verifyExactEvmX402Settlement>[0]
  type SettlementOverrides = Partial<SettlementInput>
  const mainnet = settlementFixture('production')
  const response = mainnet.response
  const requirement = mainnet.requirement
  const receipt = mainnet.receipt as X402EvmReceipt
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
      { address: BASE_MAINNET_USDC_ADDRESS, data: transfer.data, topics: transfer.topics },
      { address: BASE_MAINNET_USDC_ADDRESS, data: conflictingTransfer.data, topics: conflictingTransfer.topics },
    ] } }],
    ['wrong asset', { requirement: { ...requirement, asset: payTo } }],
    ['wrong network', { response: { ...response, network: 'eip155:1' } }],
    ['wrong requirement network', { requirement: { ...requirement, network: 'eip155:1' } }],
    ['wrong payer', { payer: payTo }],
    ['wrong hash', { response: { ...response, transaction: `0x${'5'.repeat(64)}` } }],
    ['missing block identity', { receipt: { ...receipt, blockHash: undefined, blockNumber: undefined } as unknown as X402EvmReceipt }],
    ['reverted receipt', { receipt: { ...receipt, status: 'reverted' as const } }],
    ['insufficient confirmations', { receipt: { ...receipt, confirmations: 11n } }],
  ]

  it.each(rejectionCases)('%s is rejected', (_label, overrides) => {
    expect(verifyExactEvmX402Settlement({
      aeEnvironment: overrides.aeEnvironment ?? mainnet.aeEnvironment,
      response: overrides.response ?? response,
      requirement: overrides.requirement ?? requirement,
      payer: overrides.payer ?? payer,
      paymentNonce: overrides.paymentNonce ?? nonce,
      receipt: overrides.receipt ?? receipt,
    })).toBe(false)
  })

  it.each([
    [
      'sandbox environment with the complete mainnet pair',
      {
        ...settlementFixture('production'),
        aeEnvironment: 'sandbox',
      },
    ],
    [
      'production environment with the complete testnet pair',
      {
        ...settlementFixture('sandbox'),
        aeEnvironment: 'production',
      },
    ],
    [
      'Base Sepolia network crossed with mainnet USDC',
      {
        ...settlementFixture('sandbox'),
        requirement: {
          ...settlementFixture('sandbox').requirement,
          asset: BASE_MAINNET_USDC_ADDRESS,
        },
        receipt: {
          ...settlementFixture('sandbox').receipt,
          transactionTo: BASE_MAINNET_USDC_ADDRESS,
          logs: [{
            address: BASE_MAINNET_USDC_ADDRESS,
            data: transfer.data,
            topics: transfer.topics,
          }],
        },
      },
    ],
    [
      'Base mainnet network crossed with Sepolia USDC',
      {
        ...settlementFixture('production'),
        requirement: {
          ...settlementFixture('production').requirement,
          asset: BASE_SEPOLIA_USDC_ADDRESS,
        },
        receipt: {
          ...settlementFixture('production').receipt,
          transactionTo: BASE_SEPOLIA_USDC_ADDRESS,
          logs: [{
            address: BASE_SEPOLIA_USDC_ADDRESS,
            data: transfer.data,
            topics: transfer.topics,
          }],
        },
      },
    ],
  ] as const)('rejects %s', (_label, crossed) => {
    expect(verifyExactEvmX402Settlement(crossed as SettlementInput)).toBe(false)
  })

  it('rejects an environment outside the admitted profile set at runtime', () => {
    expect(verifyExactEvmX402Settlement({
      ...settlementFixture('sandbox'),
      aeEnvironment: 'development',
    } as unknown as SettlementInput)).toBe(false)
  })
})
