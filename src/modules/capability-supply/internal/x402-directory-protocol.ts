import { findDefaultAsset } from '@x402/evm'
import { extractDiscoveryInfoV1 } from '@x402/extensions/bazaar'
import type { Network, PaymentRequirementsV1 } from '@x402/core/types'
import { base, baseSepolia, mainnet, arbitrum, optimism, polygon, avalanche } from 'viem/chains'

const namedChains = [base, baseSepolia, mainnet, arbitrum, optimism, polygon, avalanche]

/** Names a declared x402 network for display; unknown networks read back verbatim. */
export function x402NetworkLabel(network: string): string {
  if (network === 'solana' || network === 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp') return 'Solana'
  if (network === 'solana-devnet' || network === 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1') return 'Solana Devnet'
  const chain = namedChains.find((candidate) => network === `eip155:${candidate.id}` || network === candidate.name.toLowerCase().replaceAll(' ', '-'))
  return chain?.name ?? network
}

/** Resolves the protocol's default asset facts so callers never format an unknown asset. */
export function x402DefaultAssetFacts(assetId: string, network: string): Readonly<{ symbol: string; decimals: number }> | undefined {
  const asset = findDefaultAsset(assetId, network as Network)
  return asset === undefined ? undefined : { symbol: asset.symbol, decimals: asset.decimals }
}

/** Reads pre-Bazaar discovery metadata. Malformed optional legacy metadata never hides a Tool. */
export function x402LegacyDiscoveryInfo(accepted: unknown): unknown {
  if (accepted === undefined || accepted === null) return undefined
  try {
    return extractDiscoveryInfoV1(accepted as PaymentRequirementsV1)
  } catch {
    return undefined
  }
}
