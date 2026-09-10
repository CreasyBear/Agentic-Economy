import { eip3009ABI } from '@x402/evm'
import {
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  isAddress,
  type Hex,
} from 'viem'

import {
  x402PaymentProfileForEnvironment,
  type X402AeEnvironment,
} from './x402-payment-profile'

export type X402EvmReceipt = Readonly<{
  transactionHash: string
  status: 'success' | 'reverted'
  confirmations: bigint
  blockHash: string
  blockNumber: bigint
  observedBlockTimestamp: bigint
  authorizationState: boolean
  transactionTo: string | null
  transactionInput: string
  logs: readonly Readonly<{
    address: string
    data: string
    topics: readonly string[]
  }>[]
}>

type ExactEvmX402AuthorizationInput = Readonly<{
  aeEnvironment: X402AeEnvironment
  requirement: Readonly<{
    scheme: string
    network: string
    amount: string
    asset: string
    payTo: string
  }>
  payer: string | undefined
  paymentNonce: string
  paymentAuthorizationExpiresAt?: number
  receipt: X402EvmReceipt | undefined
}>

const transactionHashPattern = /^0x[0-9a-fA-F]{64}$/
const decimalAmountPattern = /^(?:0|[1-9]\d*)$/
const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/
const authorizationCanceledAbi = [{
  type: 'event',
  name: 'AuthorizationCanceled',
  inputs: [
    { name: 'authorizer', type: 'address', indexed: true },
    { name: 'nonce', type: 'bytes32', indexed: true },
  ],
  anonymous: false,
}] as const

export function verifyExactEvmX402Settlement(input: Readonly<{
  aeEnvironment: X402AeEnvironment
  response: Readonly<{
    success: boolean
    transaction: string
    network: string
    amount?: string
    payer?: string
  }>,
  requirement: Readonly<{
    scheme: string
    network: string
    amount: string
    asset: string
    payTo: string
  }>,
  payer: string | undefined
  paymentNonce: string
  receipt: X402EvmReceipt | undefined
}>): boolean {
  const { aeEnvironment, response, requirement, payer, paymentNonce, receipt } = input
  const profile = x402PaymentProfileForEnvironment(aeEnvironment)
  if (
    profile === undefined
    || requirement.scheme !== profile.scheme
    || requirement.network !== profile.network
    || response.success !== true
    || response.network !== profile.network
    || !transactionHashPattern.test(response.transaction)
    || (response.amount !== undefined && response.amount !== requirement.amount)
    || (
      response.payer !== undefined
      && (payer === undefined
        || !isAddress(response.payer)
        || response.payer.toLowerCase() !== payer.toLowerCase())
    )
    || receipt === undefined
    || receipt.status !== 'success'
    || receipt.confirmations < 12n
    || typeof receipt.blockHash !== 'string'
    || !transactionHashPattern.test(receipt.blockHash)
    || typeof receipt.blockNumber !== 'bigint'
    || receipt.blockNumber < 0n
    || receipt.authorizationState !== true
    || !transactionHashPattern.test(receipt.transactionHash)
    || receipt.transactionHash.toLowerCase() !== response.transaction.toLowerCase()
    || !Array.isArray(receipt.logs)
    || !verifyExactEvmX402AuthorizationTransaction({
      aeEnvironment,
      requirement,
      payer,
      paymentNonce,
      receipt,
    })
  ) return false
  if (payer === undefined) return false

  let hasTransfer = false
  for (const log of receipt.logs) {
    if (
      typeof log !== 'object'
      || log === null
      || typeof log.address !== 'string'
      || typeof log.data !== 'string'
      || !Array.isArray(log.topics)
      || !isAddress(log.address)
      || log.address.toLowerCase() !== profile.asset.toLowerCase()
      || !isHexData(log.data)
      || log.topics.length !== 3
      || log.topics.some((topic: unknown) => typeof topic !== 'string' || !isHexData(topic))
    ) continue

    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        eventName: 'Transfer',
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      })
      const matches = decoded.args.from.toLowerCase() === payer.toLowerCase()
        && decoded.args.to.toLowerCase() === requirement.payTo.toLowerCase()
        && decoded.args.value === BigInt(requirement.amount)
      if (!matches) return false
      hasTransfer = true
    } catch {
      // A malformed or unrelated log is not settlement evidence.
    }
  }

  return hasTransfer
}

/** Verify the exact signed transfer identity independently of transaction outcome. */
export function verifyExactEvmX402AuthorizationTransaction(
  input: ExactEvmX402AuthorizationInput,
): boolean {
  const {
    aeEnvironment,
    requirement,
    payer,
    paymentNonce,
    paymentAuthorizationExpiresAt,
    receipt,
  } = input
  const profile = x402PaymentProfileForEnvironment(aeEnvironment)
  if (
    profile === undefined
    || requirement.scheme !== profile.scheme
    || requirement.network !== profile.network
    || !isAddress(requirement.asset)
    || requirement.asset.toLowerCase() !== profile.asset.toLowerCase()
    || !isAddress(requirement.payTo)
    || !decimalAmountPattern.test(requirement.amount)
    || payer === undefined
    || !isAddress(payer)
    || !bytes32Pattern.test(paymentNonce)
    || receipt === undefined
    || typeof receipt.transactionTo !== 'string'
    || !isAddress(receipt.transactionTo)
    || receipt.transactionTo.toLowerCase() !== profile.asset.toLowerCase()
    || !isHexData(receipt.transactionInput)
  ) return false
  const authorization = decodeTransferWithAuthorization(receipt.transactionInput)
  return authorization !== undefined
    && authorization.from.toLowerCase() === payer.toLowerCase()
    && authorization.to.toLowerCase() === requirement.payTo.toLowerCase()
    && authorization.value === BigInt(requirement.amount)
    && authorization.nonce.toLowerCase() === paymentNonce.toLowerCase()
    && authorizationExpiryMatches(authorization.validBefore, paymentAuthorizationExpiresAt)
}

function authorizationExpiryMatches(validBefore: bigint, expiresAt: number | undefined): boolean {
  if (expiresAt === undefined) return true
  return Number.isSafeInteger(expiresAt)
    && expiresAt > 0
    && validBefore * 1_000n === BigInt(expiresAt)
}

/** Verify that the exact EIP-3009 nonce was consumed by a confirmed cancellation. */
export function verifyExactEvmX402AuthorizationCancellation(input: Readonly<{
  aeEnvironment: X402AeEnvironment
  asset: string
  payer: string | undefined
  paymentNonce: string | undefined
  receipt: X402EvmReceipt | undefined
}>): boolean {
  const { aeEnvironment, asset, payer, paymentNonce, receipt } = input
  const profile = x402PaymentProfileForEnvironment(aeEnvironment)
  const identityMatches = [
    profile !== undefined,
    isAddress(asset),
    profile !== undefined && asset.toLowerCase() === profile.asset.toLowerCase(),
    typeof payer === 'string',
    typeof payer === 'string' && isAddress(payer),
    typeof paymentNonce === 'string',
    typeof paymentNonce === 'string' && bytes32Pattern.test(paymentNonce),
    receipt !== undefined,
    receipt?.status === 'success',
    receipt !== undefined && receipt.confirmations >= 12n,
    receipt?.authorizationState === true,
    typeof receipt?.transactionTo === 'string',
    typeof receipt?.transactionTo === 'string' && isAddress(receipt.transactionTo),
    typeof receipt?.transactionTo === 'string'
      && receipt.transactionTo.toLowerCase() === asset.toLowerCase(),
  ].every(Boolean)
  if (!identityMatches || receipt === undefined || payer === undefined || paymentNonce === undefined) {
    return false
  }
  return receipt.logs.some((log) => authorizationCancellationLogMatches(
    log,
    asset,
    payer,
    paymentNonce,
  ))
}

function authorizationCancellationLogMatches(
  log: X402EvmReceipt['logs'][number],
  asset: string,
  payer: string,
  paymentNonce: string,
): boolean {
  if (
    !isAddress(log.address)
    || log.address.toLowerCase() !== asset.toLowerCase()
    || !isHexData(log.data)
    || log.topics.length !== 3
    || log.topics.some((topic) => !isHexData(topic))
  ) return false
  try {
    const decoded = decodeEventLog({
      abi: authorizationCanceledAbi,
      eventName: 'AuthorizationCanceled',
      data: log.data as Hex,
      topics: log.topics as [Hex, ...Hex[]],
    })
    return decoded.args.authorizer.toLowerCase() === payer.toLowerCase()
      && decoded.args.nonce.toLowerCase() === paymentNonce.toLowerCase()
  } catch {
    return false
  }
}

function decodeTransferWithAuthorization(
  input: string,
): Readonly<{
  from: string
  to: string
  value: bigint
  validBefore: bigint
  nonce: string
}> | undefined {
  try {
    const decoded = decodeFunctionData({
      abi: eip3009ABI,
      data: input as Hex,
    })
    if (
      decoded.functionName !== 'transferWithAuthorization'
      || !Array.isArray(decoded.args)
      || decoded.args.length < 6
      || typeof decoded.args[0] !== 'string'
      || typeof decoded.args[1] !== 'string'
      || typeof decoded.args[2] !== 'bigint'
      || typeof decoded.args[4] !== 'bigint'
      || typeof decoded.args[5] !== 'string'
      || !isAddress(decoded.args[0])
      || !isAddress(decoded.args[1])
      || !bytes32Pattern.test(decoded.args[5])
    ) return undefined
    return {
      from: decoded.args[0],
      to: decoded.args[1],
      value: decoded.args[2],
      validBefore: decoded.args[4],
      nonce: decoded.args[5],
    }
  } catch {
    return undefined
  }
}

function isHexData(value: unknown): value is string {
  return typeof value === 'string'
    && /^0x(?:[0-9a-fA-F]{2})*$/.test(value)
}
