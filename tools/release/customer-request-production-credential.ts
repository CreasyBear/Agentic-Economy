import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

import {
  customerRequestProductionSmokeConfigFromEnvironment,
  runCustomerRequestProductionSmoke,
} from './customer-request-production-smoke'

const REQUIRED_SCOPE = 'customer_requests:create'
const ACCEPTANCE_PRIMARY_EMAIL = 'joel@agentic-economy.ai'
const CLERK_API = 'https://api.clerk.com/v1'
const instanceSchema = z.looseObject({ id: z.string().min(1), environment_type: z.string().min(1) })
const userSchema = z.looseObject({
  id: z.string().min(1), banned: z.boolean(), locked: z.boolean(),
  primary_email_address_id: z.string().min(1),
  email_addresses: z.array(z.looseObject({
    id: z.string().min(1), email_address: z.email(),
    verification: z.looseObject({ status: z.string().min(1) }),
  })),
})
const createdKeyIdentitySchema = z.looseObject({ id: z.string().min(1) })
const createdKeySchema = z.looseObject({ id: z.string().min(1), secret: z.string().min(1) })
const createdSessionSchema = z.looseObject({ id: z.string().min(1), status: z.string().min(1) })
const createdSessionIdentitySchema = z.looseObject({ id: z.string().min(1) })
const sessionTokenSchema = z.looseObject({ jwt: z.string().min(1) })

export async function withTemporaryClerkAcceptanceCredentials(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  fetch: typeof globalThis.fetch
  run: (credentials: Readonly<{ agentApiKey: string; customerSessionToken: string }>) => Promise<void>
  keyNamePrefix?: string
}>): Promise<void> {
  const headers = await clerkAcceptanceHeaders(input)
  await withTemporaryAgentKey({ ...input, headers, run: async (agentApiKey) => {
    let sessionId: string | undefined
    let journeyError: unknown
    try {
      const sessionValue = await readClerkJson(input.fetch, `${CLERK_API}/sessions`, {
        method: 'POST', headers, body: JSON.stringify({ user_id: input.subject }),
      }, 'clerk_temporary_session_creation_failed')
      sessionId = createdSessionIdentitySchema.parse(sessionValue).id
      const session = createdSessionSchema.parse(sessionValue)
      const sessionToken = sessionTokenSchema.parse(await readClerkJson(
        input.fetch, `${CLERK_API}/sessions/${encodeURIComponent(session.id)}/tokens`,
        { method: 'POST', headers }, 'clerk_temporary_session_token_failed',
      ))
      await input.run({ agentApiKey, customerSessionToken: sessionToken.jwt })
    } catch (error) {
      journeyError = error
    }
    const revocationFailure = sessionId === undefined
      ? undefined
      : await revokeTemporarySession(input.fetch, headers, sessionId)
    if (journeyError !== undefined && revocationFailure !== undefined) {
      throw new AggregateError([journeyError, revocationFailure], 'cold journey and temporary session revocation both failed')
    }
    if (journeyError !== undefined) throw journeyError
    if (revocationFailure !== undefined) throw revocationFailure
  } })
}

export async function withTemporaryClerkApiKey(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  fetch: typeof globalThis.fetch
  run: (apiKey: string) => Promise<void>
  keyNamePrefix?: string
}>): Promise<void> {
  const headers = await clerkAcceptanceHeaders(input)
  await withTemporaryAgentKey({ ...input, headers, run: input.run })
}

async function clerkAcceptanceHeaders(input: Readonly<{
  clerkSecretKey: string; expectedInstanceId: string; subject: string; fetch: typeof globalThis.fetch
}>): Promise<Record<string, string>> {
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
  assertAcceptanceUser(user, input.subject)
  return headers
}

async function withTemporaryAgentKey(input: Readonly<{
  subject: string; fetch: typeof globalThis.fetch; headers: Record<string, string>
  keyNamePrefix?: string; run: (apiKey: string) => Promise<void>
}>): Promise<void> {
  const createdValue = await readClerkJson(input.fetch, `${CLERK_API}/api_keys`, {
    method: 'POST', headers: input.headers,
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
      method: 'POST', headers: input.headers,
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

async function revokeTemporarySession(
  fetch: typeof globalThis.fetch,
  headers: Record<string, string>,
  sessionId: string,
): Promise<Error | undefined> {
  try {
    const response = await fetch(`${CLERK_API}/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: 'POST', headers,
    })
    return response.ok ? undefined : new Error(`clerk_temporary_session_revocation_failed:${response.status}`)
  } catch (error) {
    return new Error('clerk_temporary_session_revocation_failed', { cause: error })
  }
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

function assertAcceptanceUser(user: z.infer<typeof userSchema>, subject: string): void {
  const primary = user.email_addresses.find((email) => email.id === user.primary_email_address_id)
  if (user.id !== subject || user.banned || user.locked
    || primary?.email_address.toLowerCase() !== ACCEPTANCE_PRIMARY_EMAIL
    || primary.verification.status !== 'verified') {
    throw new Error('clerk_acceptance_subject_not_admitted')
  }
}

async function main(): Promise<void> {
  await withTemporaryClerkApiKey({
    clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
    expectedInstanceId: process.env.AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID ?? '',
    subject: process.env.AE_CUSTOMER_REQUEST_CLERK_SUBJECT ?? '',
    fetch: globalThis.fetch,
    run: async (agentApiKey) => {
      await runCustomerRequestProductionSmoke(
        customerRequestProductionSmokeConfigFromEnvironment(process.env, agentApiKey),
      )
    },
  })
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? `FAIL ${error.message}` : 'FAIL unexpected_error')
    process.exitCode = 1
  })
}
