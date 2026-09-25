import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { StringEnvironment } from '@/lib/server/read-trimmed-env'

import { env } from '../../../_generated/server'

const MAX_X402_RPC_CONFIG_LENGTH = 16_384

export function custodyEnvironment(): StringEnvironment {
  return {
    CDP_API_KEY_ID: env.CDP_API_KEY_ID,
    CDP_API_KEY_SECRET: env.CDP_API_KEY_SECRET,
    CDP_WALLET_SECRET: env.CDP_WALLET_SECRET,
    AE_X402_CDP_ACCOUNT_NAME: env.AE_X402_CDP_ACCOUNT_NAME,
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: env.AE_X402_CDP_EXPECTED_EVM_ADDRESS,
    AE_X402_CDP_ACCOUNT_POLICY_ID: env.AE_X402_CDP_ACCOUNT_POLICY_ID,
    AE_X402_CDP_PROJECT_POLICY_ID: env.AE_X402_CDP_PROJECT_POLICY_ID,
    AE_X402_CDP_POLICY_RULES_DIGEST: env.AE_X402_CDP_POLICY_RULES_DIGEST,
    AE_X402_CDP_CREDENTIAL_GENERATION: env.AE_X402_CDP_CREDENTIAL_GENERATION,
    AE_X402_CUSTODY_ENABLED: env.AE_X402_CUSTODY_ENABLED,
    AE_X402_CUSTODY_MAX_ATOMIC: env.AE_X402_CUSTODY_MAX_ATOMIC,
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: env.AE_X402_CUSTODY_DAILY_MAX_ATOMIC,
  }
}

/** Mirrors the runtime's bounded one-or-two HTTPS endpoint rule for sandbox. */
export function rpcEndpointCount(network: string): number {
  const raw = env.AE_X402_RPC_URLS_JSON?.trim()
  if (raw === undefined || raw.length === 0 || raw.length > MAX_X402_RPC_CONFIG_LENGTH) return 0
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 0
    const configured = (parsed as Record<string, unknown>)[network]
    if (!Array.isArray(configured) || configured.length < 1 || configured.length > 2) return 0
    const urls = configured.map((value) => {
      if (typeof value !== 'string' || value.length === 0) return undefined
      try {
        const url = new URL(value)
        return url.protocol === 'https:' ? url.href : undefined
      } catch (cause) {
        return degradeBackend(cause, undefined, { site: 'rpcEndpointCount', reason: 'invalid_response' })
      }
    })
    if (urls.some((url) => url === undefined)) return 0
    return new Set(urls).size === urls.length ? urls.length : 0
  } catch (cause) {
    return degradeBackend(cause, 0, { site: 'rpcEndpointCount', reason: 'invalid_response' })
  }
}
