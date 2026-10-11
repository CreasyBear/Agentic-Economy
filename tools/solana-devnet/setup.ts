import type { CdpClient } from '@coinbase/cdp-sdk'

import { formatCurrencyAmount } from '@/modules/money/public'

import {
  CIRCLE_DEVNET_FAUCET_URL,
  DEVNET_USDC_MINT,
  SELLER_ACCOUNT_NAME,
  agentAccountName,
  cdpClient,
  explorerAddressUrl,
  parseAgentId,
  readFlag,
} from './devnet'
import { devnetUsdcFromAtomic } from './spend-cap'

/** One faucet drip is 1 USDC; below 0.10 USDC the demo cannot afford ten Calls. */
const BUYER_USDC_FLOOR_ATOMIC = 100_000n

async function devnetUsdcAtomic(cdp: CdpClient, address: string): Promise<bigint> {
  const { balances } = await cdp.solana.listTokenBalances({ address, network: 'solana-devnet' })
  const usdc = balances.find((balance) => balance.token.mintAddress === DEVNET_USDC_MINT)
  return usdc === undefined ? 0n : BigInt(usdc.amount.amount)
}

async function dripUsdc(cdp: CdpClient, role: string, address: string): Promise<void> {
  try {
    const { signature } = await cdp.solana.requestFaucet({ address, token: 'usdc' })
    console.log(`devnet: ${role} USDC faucet tx ${signature}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`devnet: ${role} CDP USDC faucet refused (${message}).`)
    console.log(`devnet: fund ${address} with devnet USDC at ${CIRCLE_DEVNET_FAUCET_URL} (network Solana Devnet).`)
  }
}

async function main(): Promise<void> {
  const agentId = parseAgentId(readFlag(process.argv.slice(2), 'agent') ?? 'demo')
  const cdp = cdpClient()
  const buyer = await cdp.solana.getOrCreateAccount({ name: agentAccountName(agentId) })
  const seller = await cdp.solana.getOrCreateAccount({ name: SELLER_ACCOUNT_NAME })

  // The exact SVM scheme pays into the seller's existing USDC token account, and a faucet drip creates it.
  if (await devnetUsdcAtomic(cdp, seller.address) === 0n) await dripUsdc(cdp, 'seller', seller.address)
  if (await devnetUsdcAtomic(cdp, buyer.address) < BUYER_USDC_FLOOR_ATOMIC) await dripUsdc(cdp, 'buyer', buyer.address)

  for (const [role, account] of [['buyer', buyer], ['seller', seller]] as const) {
    const holding = formatCurrencyAmount(devnetUsdcFromAtomic((await devnetUsdcAtomic(cdp, account.address)).toString()))
    console.log(`devnet: ${role} ${account.name} ${account.address} holds ${holding} ${explorerAddressUrl(account.address)}`)
  }
  console.log('devnet: balances can lag a faucet drip by a few seconds; rerun setup to refresh them.')
}

await main()
