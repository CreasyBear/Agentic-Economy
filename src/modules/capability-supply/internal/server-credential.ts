import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import { isProviderConnectionCredentialRef } from '../provider-connection'
import {
  x402PaymentProfileForEnvironment,
  type X402AeEnvironment,
} from './x402-payment-profile'
import {
  cdpX402CustodyConfigurationFromEnvironment as parseCdpX402CustodyConfiguration,
  type CdpX402CustodyConfiguration,
} from './x402-custody-configuration'

export type { CdpX402CustodyConfiguration } from './x402-custody-configuration'

export const X402_PAYMENT_CREDENTIAL_REF_ENV = 'AE_X402_PAYMENT_CREDENTIAL_REF'

/** Read the opaque x402 payer locator without resolving its signing secret. */
export function x402PaymentCredentialRefFromEnvironment(
  environment: StringEnvironment = process.env,
): string | undefined {
  const reference = readTrimmedEnv(environment, X402_PAYMENT_CREDENTIAL_REF_ENV)
  return isProviderConnectionCredentialRef(reference) ? reference : undefined
}

/** Resolve an opaque provider `env:` locator without returning the locator itself. */
export function credentialFromEnvironment(reference: string): string | undefined {
  if (!isProviderConnectionCredentialRef(reference)) return undefined
  return readTrimmedEnv(process.env, reference.slice(4))
}

export function cdpX402CustodyConfigurationFromEnvironment(
  environment: StringEnvironment = process.env,
): CdpX402CustodyConfiguration | undefined {
  return parseCdpX402CustodyConfiguration(environment)
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
