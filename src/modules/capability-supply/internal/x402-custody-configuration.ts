import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import {
  x402PaymentProfileForEnvironment,
  type X402AeEnvironment,
} from './x402-payment-profile'
import type { StableHashValue } from '@/modules/common/stable-hash'

export const X402_CDP_API_KEY_ID_ENV = 'CDP_API_KEY_ID'
export const X402_CDP_API_KEY_SECRET_ENV = 'CDP_API_KEY_SECRET'
export const X402_CDP_WALLET_SECRET_ENV = 'CDP_WALLET_SECRET'
export const X402_CDP_ACCOUNT_NAME_ENV = 'AE_X402_CDP_ACCOUNT_NAME'
export const X402_CDP_EXPECTED_EVM_ADDRESS_ENV = 'AE_X402_CDP_EXPECTED_EVM_ADDRESS'
export const X402_CDP_ACCOUNT_POLICY_ID_ENV = 'AE_X402_CDP_ACCOUNT_POLICY_ID'
export const X402_CDP_PROJECT_POLICY_ID_ENV = 'AE_X402_CDP_PROJECT_POLICY_ID'
export const X402_CDP_POLICY_RULES_DIGEST_ENV = 'AE_X402_CDP_POLICY_RULES_DIGEST'
export const X402_CDP_CREDENTIAL_GENERATION_ENV = 'AE_X402_CDP_CREDENTIAL_GENERATION'
export const X402_CUSTODY_ENABLED_ENV = 'AE_X402_CUSTODY_ENABLED'
export const X402_CUSTODY_MAX_ATOMIC_ENV = 'AE_X402_CUSTODY_MAX_ATOMIC'
export const X402_CUSTODY_DAILY_MAX_ATOMIC_ENV = 'AE_X402_CUSTODY_DAILY_MAX_ATOMIC'

export type CdpX402CustodyConfiguration = Readonly<{
  apiKeyId: string
  apiKeySecret: string
  walletSecret: string
  accountName: string
  expectedEvmAddress: string
  accountPolicyId: string
  projectPolicyId: string
  policyRulesDigest: string
  credentialGeneration: number
  maxAtomic: bigint
  dailyMaxAtomic: bigint
}>

/** Pure, V8-safe parser shared by the Node signer and Convex readiness checks. */
export function cdpX402CustodyConfigurationFromEnvironment(
  environment: StringEnvironment,
): CdpX402CustodyConfiguration | undefined {
  if (readTrimmedEnv(environment, X402_CUSTODY_ENABLED_ENV) !== 'true') return undefined
  const apiKeyId = readTrimmedEnv(environment, X402_CDP_API_KEY_ID_ENV)
  const apiKeySecret = readTrimmedEnv(environment, X402_CDP_API_KEY_SECRET_ENV)
  const walletSecret = readTrimmedEnv(environment, X402_CDP_WALLET_SECRET_ENV)
  const accountName = readTrimmedEnv(environment, X402_CDP_ACCOUNT_NAME_ENV)
  const expectedEvmAddress = readTrimmedEnv(environment, X402_CDP_EXPECTED_EVM_ADDRESS_ENV)
  const accountPolicyId = readTrimmedEnv(environment, X402_CDP_ACCOUNT_POLICY_ID_ENV)
  const projectPolicyId = readTrimmedEnv(environment, X402_CDP_PROJECT_POLICY_ID_ENV)
  const policyRulesDigest = readTrimmedEnv(environment, X402_CDP_POLICY_RULES_DIGEST_ENV)
  const rawCredentialGeneration = readTrimmedEnv(environment, X402_CDP_CREDENTIAL_GENERATION_ENV)
  const rawMaxAtomic = readTrimmedEnv(environment, X402_CUSTODY_MAX_ATOMIC_ENV)
  const rawDailyMaxAtomic = readTrimmedEnv(environment, X402_CUSTODY_DAILY_MAX_ATOMIC_ENV)
  if (
    apiKeyId === undefined
    || apiKeySecret === undefined
    || walletSecret === undefined
    || accountName === undefined
    || expectedEvmAddress === undefined
    || !/^0x[0-9a-fA-F]{40}$/.test(expectedEvmAddress)
    || accountPolicyId === undefined
    || !isUuid(accountPolicyId)
    || projectPolicyId === undefined
    || !isUuid(projectPolicyId)
    || policyRulesDigest === undefined
    || !isCanonicalDigest(policyRulesDigest)
    || rawCredentialGeneration === undefined
    || !/^\d+$/.test(rawCredentialGeneration)
    || rawMaxAtomic === undefined
    || !/^\d+$/.test(rawMaxAtomic)
    || rawMaxAtomic === '0'
    || rawDailyMaxAtomic === undefined
    || !/^\d+$/.test(rawDailyMaxAtomic)
    || rawDailyMaxAtomic === '0'
  ) return undefined
  try {
    const credentialGeneration = Number(rawCredentialGeneration)
    const maxAtomic = BigInt(rawMaxAtomic)
    const dailyMaxAtomic = BigInt(rawDailyMaxAtomic)
    if (
      !Number.isSafeInteger(credentialGeneration)
      || credentialGeneration <= 0
      || maxAtomic <= 0n
      || dailyMaxAtomic < maxAtomic
    ) return undefined
    return {
      apiKeyId,
      apiKeySecret,
      walletSecret,
      accountName,
      expectedEvmAddress: expectedEvmAddress.toLowerCase(),
      accountPolicyId: accountPolicyId.toLowerCase(),
      projectPolicyId: projectPolicyId.toLowerCase(),
      policyRulesDigest,
      credentialGeneration,
      maxAtomic,
      dailyMaxAtomic,
    }
  } catch {
    return undefined
  }
}

export function cdpX402CustodyBudgetRef(
  configuration: CdpX402CustodyConfiguration,
  aeEnvironment: X402AeEnvironment = 'production',
): string {
  const profile = x402PaymentProfileForEnvironment(aeEnvironment)
  if (profile === undefined) throw new Error('x402_payment_profile_invalid')
  return canonicalDigest({
    kind: 'ae.x402.custody-budget:v1',
    network: profile.network,
    expectedEvmAddress: configuration.expectedEvmAddress.toLowerCase(),
  } as StableHashValue)
}

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
}
