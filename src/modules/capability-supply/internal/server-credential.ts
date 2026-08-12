import { readTrimmedEnv, type StringEnvironment } from '@/lib/server/read-trimmed-env'
import { isProviderConnectionCredentialRef } from '../provider-connection'

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
