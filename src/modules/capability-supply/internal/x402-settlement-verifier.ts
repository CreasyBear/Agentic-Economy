import { decodeEventLog, erc20Abi, isAddress, type Hex } from 'viem'

export type X402EvmReceipt = Readonly<{
  transactionHash: string
  status: 'success' | 'reverted'
  confirmations: bigint
  logs: readonly Readonly<{
    address: string
    data: string
    topics: readonly string[]
  }>[]
}>

export function verifyExactEvmX402Settlement(input: Readonly<{
  response: Readonly<{
    success: boolean
    transaction: string
    network: string
    amount?: string
    payer?: string
  }>
  requirement: Readonly<{
    scheme: string
    network: string
    amount: string
    asset: string
    payTo: string
  }>
  payer: string | undefined
  receipt: X402EvmReceipt | undefined
}>): boolean {
  const { response, requirement, payer, receipt } = input
  if (
    requirement.scheme !== 'exact'
    || !requirement.network.startsWith('eip155:')
    || response.success !== true
    || response.network !== requirement.network
    || (response.amount !== undefined && response.amount !== requirement.amount)
    || payer === undefined
    || (
      response.payer !== undefined
      && response.payer.toLowerCase() !== payer.toLowerCase()
    )
    || receipt === undefined
    || receipt.status !== 'success'
    || receipt.confirmations < 12n
    || receipt.transactionHash.toLowerCase() !== response.transaction.toLowerCase()
    || !isAddress(requirement.asset)
    || !isAddress(requirement.payTo)
    || !isAddress(payer)
    || !/^\d+$/.test(requirement.amount)
  ) return false

  return receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== requirement.asset.toLowerCase()) return false
    try {
      const decoded = decodeEventLog({
        abi: erc20Abi,
        eventName: 'Transfer',
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      })
      return decoded.args.from.toLowerCase() === payer.toLowerCase()
        && decoded.args.to.toLowerCase() === requirement.payTo.toLowerCase()
        && decoded.args.value === BigInt(requirement.amount)
    } catch {
      return false
    }
  })
}
