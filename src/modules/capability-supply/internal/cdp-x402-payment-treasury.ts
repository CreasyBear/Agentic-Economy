import { CdpClient } from '@coinbase/cdp-sdk'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import { cdpX402CustodyBudgetRef, cdpX402CustodyConfigurationFromEnvironment } from './server-credential'
import { x402PaymentProfileForEnvironment, type X402AeEnvironment } from './x402-payment-profile'
import type {
  CdpClientLike,
  CdpX402TreasuryObservation,
  CdpX402TreasuryObserverDependencies,
} from './cdp-x402-payment-contracts'
import { sameEvmAddress } from './cdp-x402-payment-validation'

/**
 * Reads only the configured x402 wallet's USDC balance through the maintained
 * CDP client. The returned evidence contains no API key, wallet secret,
 * signature, raw provider payload, or unrestricted token list.
 */
export async function observeCdpX402Treasury(
  aeEnvironment: X402AeEnvironment,
  dependencies: CdpX402TreasuryObserverDependencies = {},
): Promise<CdpX402TreasuryObservation | undefined> {
  const configuration = cdpX402CustodyConfigurationFromEnvironment(
    dependencies.environment,
  )
  const profile = x402PaymentProfileForEnvironment(aeEnvironment)
  if (configuration === undefined || profile === undefined) return undefined
  const client = dependencies.createClient?.(configuration)
    ?? (new CdpClient({
      apiKeyId: configuration.apiKeyId,
      apiKeySecret: configuration.apiKeySecret,
      walletSecret: configuration.walletSecret,
    }) as CdpClientLike)
  if (client.evm.listTokenBalances === undefined) return undefined
  try {
    const account = await client.evm.getAccount({ name: configuration.accountName })
    if (!sameEvmAddress(account.address, configuration.expectedEvmAddress)) return undefined
    const sdkNetwork = aeEnvironment === 'sandbox' ? 'base-sepolia' : 'base'
    let pageToken: string | undefined
    let pages = 0
    let total = 0n
    do {
      const page = await client.evm.listTokenBalances({
        address: account.address as `0x${string}`,
        network: sdkNetwork,
        pageSize: 100,
        ...(pageToken === undefined ? {} : { pageToken }),
      })
      for (const balance of page.balances) {
        if (
          balance.token.contractAddress.toLowerCase() === profile.asset.toLowerCase()
          && balance.amount.decimals === 6
        ) total += balance.amount.amount
      }
      pageToken = page.nextPageToken
      pages += 1
    } while (pageToken !== undefined && pages < 4)
    if (pageToken !== undefined || total < 0n) return undefined
    const observedAt = (dependencies.now ?? Date.now)()
    if (!Number.isSafeInteger(observedAt) || observedAt < 0) return undefined
    const material = {
      format: 'ae.x402-treasury-observation:v1',
      environment: aeEnvironment,
      custodyRef: cdpX402CustodyBudgetRef(configuration, aeEnvironment),
      custodyGeneration: configuration.credentialGeneration,
      network: profile.network,
      asset: 'USDC' as const,
      exponent: 6 as const,
      totalUnits: total.toString(),
      observedAt,
    }
    const evidenceDigest = canonicalDigest(material)
    return {
      environment: material.environment,
      custodyRef: material.custodyRef,
      custodyGeneration: material.custodyGeneration,
      network: material.network,
      asset: material.asset,
      exponent: material.exponent,
      totalUnits: material.totalUnits,
      evidenceRef: `cdp-balance:${evidenceDigest.slice('sha256:'.length)}`,
      evidenceDigest,
      observedAt: material.observedAt,
    }
  } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'observeCdpX402Treasury', reason: 'source_unavailable' })
  }
}
