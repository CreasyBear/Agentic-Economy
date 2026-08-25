import { eip3009ABI } from '@x402/evm'
import {
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  isAddress,
  type Hex,
} from 'viem'

import {
  BASE_NETWORK,
  BASE_USDC_ADDRESS,
} from './cdp-x402-payment-signer'

export type X402EvmReceipt = Readonly<{
  transactionHash: string
  status: 'success' | 'reverted'
  confirmations: bigint
  blockHash: string
  blockNumber: bigint
  authorizationState: boolean
  transactionTo: string | null
  transactionInput: string
  logs: readonly Readonly<{
    address: string
    data: string
    topics: readonly string[]
  }>[]
}>

const transactionHashPattern = /^0x[0-9a-fA-F]{64}$/
const decimalAmountPattern = /^(?:0|[1-9]\d*)$/
const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/

export function verifyExactEvmX402Settlement(input: Readonly<{
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
  const { response, requirement, payer, paymentNonce, receipt } = input
  if (
    requirement.scheme !== 'exact'
    || requirement.network !== BASE_NETWORK
    || response.success !== true
    || response.network !== BASE_NETWORK
    || !transactionHashPattern.test(response.transaction)
    || (response.amount !== undefined && response.amount !== requirement.amount)
    || payer === undefined
    || !isAddress(payer)
    || (
      response.payer !== undefined
      && (!isAddress(response.payer)
        || response.payer.toLowerCase() !== payer.toLowerCase())
    )
    || !bytes32Pattern.test(paymentNonce)
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
    || typeof receipt.transactionTo !== 'string'
    || !isAddress(receipt.transactionTo)
    || receipt.transactionTo.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()
    || !isAddress(requirement.asset)
    || requirement.asset.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()
    || !isAddress(requirement.payTo)
    || !decimalAmountPattern.test(requirement.amount)
    || !isHexData(receipt.transactionInput)
    || !Array.isArray(receipt.logs)
  ) return false

  const authorization = decodeTransferWithAuthorization(receipt.transactionInput)
  if (
    authorization === undefined
    || authorization.from.toLowerCase() !== payer.toLowerCase()
    || authorization.to.toLowerCase() !== requirement.payTo.toLowerCase()
    || authorization.value !== BigInt(requirement.amount)
    || authorization.nonce.toLowerCase() !== paymentNonce.toLowerCase()
  ) return false

  let hasTransfer = false
  for (const log of receipt.logs) {
    if (
      typeof log !== 'object'
      || log === null
      || typeof log.address !== 'string'
      || typeof log.data !== 'string'
      || !Array.isArray(log.topics)
      || !isAddress(log.address)
      || log.address.toLowerCase() !== BASE_USDC_ADDRESS.toLowerCase()
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

function decodeTransferWithAuthorization(
  input: string,
): Readonly<{
  from: string
  to: string
  value: bigint
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
      || typeof decoded.args[5] !== 'string'
      || !isAddress(decoded.args[0])
      || !isAddress(decoded.args[1])
      || !bytes32Pattern.test(decoded.args[5])
    ) return undefined
    return {
      from: decoded.args[0],
      to: decoded.args[1],
      value: decoded.args[2],
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
