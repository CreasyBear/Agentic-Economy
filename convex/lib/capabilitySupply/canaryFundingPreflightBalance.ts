import { degradeBackend } from '@/lib/observability/degrade-backend'

const MAX_BALANCE_PAGES = 10
const BALANCE_PAGE_SIZE = 100
const EXPECTED_USDC_DECIMALS = 6

/** CDP SDK network ids for the USDC lanes AE custodies (sandbox, production). */
export type CdpUsdcNetwork = 'base-sepolia' | 'base'

type CdpListTokenBalances = (
  options: Readonly<{
    address: `0x${string}`
    network: CdpUsdcNetwork
    pageSize: number
    pageToken?: string
  }>,
) => Promise<
  Readonly<{
    balances: readonly Readonly<{
      token: Readonly<{
        contractAddress: string
        network: string
      }>
      amount: Readonly<{
        amount: bigint
        decimals: number
      }>
    }>[]
    nextPageToken?: string
  }>
>

/** The CDP read surface a USDC balance observation needs, and nothing more. */
export type CdpUsdcBalanceReader = Readonly<{
  listTokenBalances: CdpListTokenBalances
}>

/** Bounded, paginated USDC balance read for one CDP network/asset lane. */
export async function readCdpUsdcBalance(
  evm: CdpUsdcBalanceReader,
  address: `0x${string}`,
  lane: Readonly<{ network: CdpUsdcNetwork; assetAddress: string }>,
): Promise<
  | Readonly<{ kind: 'read'; amount: bigint; pagesRead: number }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'not_verifiable' }>
> {
  let pageToken: string | undefined
  let pagesRead = 0
  let amount: bigint | undefined
  const seenPageTokens = new Set<string>()
  while (pagesRead < MAX_BALANCE_PAGES) {
    let page: Awaited<ReturnType<CdpListTokenBalances>>
    try {
      page = await evm.listTokenBalances({
        address,
        network: lane.network,
        pageSize: BALANCE_PAGE_SIZE,
        ...(pageToken === undefined ? {} : { pageToken }),
      })
    } catch (cause) {
      return degradeBackend(cause, { kind: 'failed' } as const, {
        site: 'readCdpUsdcBalance',
        reason: 'source_unavailable',
      })
    }
    pagesRead += 1
    for (const balance of page.balances) {
      if (
        balance.token.contractAddress.toLowerCase() !== lane.assetAddress.toLowerCase()
      ) continue
      if (
        amount !== undefined
        || balance.token.network !== lane.network
        || balance.amount.decimals !== EXPECTED_USDC_DECIMALS
        || typeof balance.amount.amount !== 'bigint'
        || balance.amount.amount < 0n
      ) return { kind: 'not_verifiable' }
      amount = balance.amount.amount
    }
    if (page.nextPageToken === undefined) {
      return { kind: 'read', amount: amount ?? 0n, pagesRead }
    }
    if (page.nextPageToken.length === 0 || seenPageTokens.has(page.nextPageToken)) {
      return { kind: 'not_verifiable' }
    }
    seenPageTokens.add(page.nextPageToken)
    pageToken = page.nextPageToken
  }
  return { kind: 'not_verifiable' }
}
