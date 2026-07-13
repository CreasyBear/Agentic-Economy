import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import {
  customerRequestProductionSmokeConfigFromEnvironment,
  runCustomerRequestProductionSmoke,
} from './customer-request-production-smoke'

const REQUIRED_SCOPE = 'customer_requests:create'
const ACCEPTANCE_PRIMARY_EMAIL = 'joel@agentic-economy.ai'
const CLERK_API = 'https://api.clerk.com/v1'
const instanceSchema = z.object({ id: z.string().min(1), environment_type: z.string().min(1) }).passthrough()
const userSchema = z.object({
  id: z.string().min(1), banned: z.boolean(), locked: z.boolean(),
  primary_email_address_id: z.string().min(1),
  email_addresses: z.array(z.object({
    id: z.string().min(1), email_address: z.string().email(),
    verification: z.object({ status: z.string().min(1) }).passthrough(),
  }).passthrough()),
}).passthrough()
const createdKeyIdentitySchema = z.object({ id: z.string().min(1) }).passthrough()
const createdKeySchema = z.object({ id: z.string().min(1), secret: z.string().min(1) }).passthrough()

export async function withTemporaryClerkApiKey(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  fetch: typeof globalThis.fetch
  run: (apiKey: string) => Promise<void>
  keyNamePrefix?: string
}>): Promise<void> {
  assertConfigured(input)
  const headers = { Authorization: `Bearer ${input.clerkSecretKey}`, 'Content-Type': 'application/json' }
  const instance = instanceSchema.parse(await readClerkJson(
    input.fetch, `${CLERK_API}/instance`, { headers }, 'clerk_instance_unavailable',
  ))
  if (instance.id !== input.expectedInstanceId) {
    throw new Error(`clerk_instance_mismatch:expected=${input.expectedInstanceId}:actual=${instance.id}`)
  }
  const user = userSchema.parse(await readClerkJson(
    input.fetch, `${CLERK_API}/users/${encodeURIComponent(input.subject)}`, { headers }, 'clerk_acceptance_subject_unavailable',
  ))
  const primaryEmail = user.email_addresses.find((email) => email.id === user.primary_email_address_id)?.email_address.toLowerCase()
  const primaryVerification = user.email_addresses.find((email) => email.id === user.primary_email_address_id)?.verification.status
  if (user.id !== input.subject || user.banned || user.locked
    || primaryEmail !== ACCEPTANCE_PRIMARY_EMAIL || primaryVerification !== 'verified') {
    throw new Error('clerk_acceptance_subject_not_admitted')
  }

  const createdValue = await readClerkJson(input.fetch, `${CLERK_API}/api_keys`, {
    method: 'POST', headers,
    body: JSON.stringify({
      name: `${input.keyNamePrefix ?? 'AE production cold-agent acceptance'} ${randomUUID()}`,
      subject: input.subject,
      scopes: [REQUIRED_SCOPE],
      seconds_until_expiration: 3_600,
    }),
  }, 'clerk_temporary_api_key_creation_failed')
  const createdIdentity = createdKeyIdentitySchema.parse(createdValue)

  let journeyError: unknown
  try {
    const created = createdKeySchema.parse(createdValue)
    await input.run(created.secret)
  } catch (error) {
    journeyError = error
  }
  let revocationFailure: Error | undefined
  try {
    const response = await input.fetch(`${CLERK_API}/api_keys/${encodeURIComponent(createdIdentity.id)}/revoke`, {
      method: 'POST', headers,
      body: JSON.stringify({ revocation_reason: 'Temporary production acceptance completed' }),
    })
    if (!response.ok) revocationFailure = new Error(`clerk_temporary_api_key_revocation_failed:${response.status}`)
  } catch (error) {
    revocationFailure = new Error('clerk_temporary_api_key_revocation_failed', { cause: error })
  }
  if (journeyError !== undefined && revocationFailure !== undefined) {
    throw new AggregateError([journeyError, revocationFailure], 'cold journey and temporary key revocation both failed')
  }
  if (journeyError !== undefined) throw journeyError
  if (revocationFailure !== undefined) throw revocationFailure
}

async function readClerkJson(
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  errorCode: string,
): Promise<unknown> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${errorCode}:${response.status}`)
  return await response.json()
}

function assertConfigured(input: Readonly<{
  clerkSecretKey: string; expectedInstanceId: string; subject: string
}>): void {
  if (!input.clerkSecretKey.trim()) throw new Error('CLERK_SECRET_KEY is required')
  if (!/^ins_[A-Za-z0-9]+$/u.test(input.expectedInstanceId)) {
    throw new Error('AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID must be an exact Clerk instance ID')
  }
  if (!/^(user|org)_[A-Za-z0-9]+$/u.test(input.subject)) {
    throw new Error('AE_CUSTOMER_REQUEST_CLERK_SUBJECT must be an exact Clerk user or organization ID')
  }
}

async function main(): Promise<void> {
  await withTemporaryClerkApiKey({
    clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
    expectedInstanceId: process.env.AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID ?? '',
    subject: process.env.AE_CUSTOMER_REQUEST_CLERK_SUBJECT ?? '',
    fetch: globalThis.fetch,
    run: async (apiKey) => await runCustomerRequestProductionSmoke(
      customerRequestProductionSmokeConfigFromEnvironment(process.env, apiKey),
    ),
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}
