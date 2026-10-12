import { CdpClient } from '@coinbase/cdp-sdk'

export const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
export const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
export const DEVNET_USDC_EXPONENT = 6
export const X402_ORG_FACILITATOR_URL = 'https://x402.org/facilitator'
export const SELLER_ACCOUNT_NAME = 'ae-devnet-seller'
export const CIRCLE_DEVNET_FAUCET_URL = 'https://faucet.circle.com/'

export const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
export const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export type SolanaCluster = Readonly<{
  /** CDP SDK network name. */
  name: 'solana-devnet' | 'solana'
  caip2: typeof SOLANA_DEVNET | typeof SOLANA_MAINNET
  usdcMint: string
  /** Explorer `cluster` query parameter; mainnet is the explorer default. */
  explorerCluster: 'devnet' | undefined
  receiptDir: string
}>

export const DEVNET: SolanaCluster = {
  name: 'solana-devnet',
  caip2: SOLANA_DEVNET,
  usdcMint: DEVNET_USDC_MINT,
  explorerCluster: 'devnet',
  receiptDir: 'output/solana-devnet/receipts',
}

export const MAINNET: SolanaCluster = {
  name: 'solana',
  caip2: SOLANA_MAINNET,
  usdcMint: MAINNET_USDC_MINT,
  explorerCluster: undefined,
  receiptDir: 'output/solana-mainnet/receipts',
}

export function parseCluster(value: string): SolanaCluster {
  if (value === 'devnet') return DEVNET
  if (value === 'mainnet') return MAINNET
  throw new Error(`--network must be devnet or mainnet, got ${value}`)
}

export type AgentId = string & { readonly __brand: 'DevnetAgentId' }

const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,19}$/

export function parseAgentId(value: string): AgentId {
  if (!AGENT_ID.test(value)) {
    throw new Error(`agent id must match ${AGENT_ID} (it becomes part of a CDP account name)`)
  }
  return value as AgentId
}

/** CDP account names allow 2-36 characters of letters, digits and hyphens. */
export function agentAccountName(agentId: AgentId): string {
  return `ae-devnet-agent-${agentId}`
}

export function explorerTransactionUrl(signature: string, cluster: SolanaCluster): string {
  const query = cluster.explorerCluster === undefined ? '' : `?cluster=${cluster.explorerCluster}`
  return `https://explorer.solana.com/tx/${signature}${query}`
}

export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`
}

const CDP_ENV_NAMES = ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'CDP_WALLET_SECRET'] as const

export function requireCdpCredentials(): void {
  const missing = CDP_ENV_NAMES.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`devnet: missing ${missing.join(', ')}. Run from a checkout whose .env.local holds the CDP keys.`)
  }
}

export function cdpClient(): CdpClient {
  requireCdpCredentials()
  return new CdpClient()
}

export function readFlag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`)
  return value
}
