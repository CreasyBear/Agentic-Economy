import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

import {
  customerRequestProductionSmokeConfigFromEnvironment,
  runCustomerRequestProductionSmoke,
} from './customer-request-production-smoke'

const DEFAULT_REQUIRED_SCOPE = 'customer_requests:create'
const ALLOWED_TEMPORARY_KEY_SCOPES = {
  'customer_requests:create': [
    'customer_requests:create',
    'customer_requests:standing_authority',
  ],
  'paid_operation:invoke': ['paid_operation:invoke'],
} as const
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
const revokedKeyReadbackSchema = z.looseObject({
  id: z.string().min(1),
  subject: z.string().min(1),
  scopes: z.array(z.string().min(1)),
  revoked: z.literal(true),
})
const revokedSessionReadbackSchema = z.looseObject({
  id: z.string().min(1),
  user_id: z.string().min(1),
  status: z.literal('revoked'),
})

export type TemporaryClerkApiKeyRevocationEvidence = Readonly<{
  credentialId: string
  subject: string
  scopes: readonly string[]
  status: 'revoked'
  secondsUntilExpiration: 3_600
}>
export type TemporaryClerkSessionRevocationEvidence = Readonly<{
  sessionId: string
  subject: string
  status: 'revoked'
}>

export async function withTemporaryClerkAcceptanceCredentials(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  fetch: typeof globalThis.fetch
  run: (credentials: Readonly<{
    agentApiKey: string
    issueCustomerSessionToken: () => Promise<string>
  }>) => Promise<void>
  keyNamePrefix?: string
  revocationReason?: string
}>): Promise<void> {
  const headers = await clerkAcceptanceHeaders({ ...input, expectedPrimaryEmail: ACCEPTANCE_PRIMARY_EMAIL })
  await withTemporaryAgentKey({ ...input, headers, run: async (agentApiKey) => {
    let sessionId: string | undefined
    let sessionToken: string | undefined
    let journeyError: unknown
    try {
      await input.run({
        agentApiKey,
        issueCustomerSessionToken: async () => {
          if (sessionToken !== undefined) return sessionToken
          const sessionValue = await readClerkJson(input.fetch, `${CLERK_API}/sessions`, {
            method: 'POST', headers, body: JSON.stringify({ user_id: input.subject }),
          }, 'clerk_temporary_session_creation_failed')
          sessionId = createdSessionIdentitySchema.parse(sessionValue).id
          const session = createdSessionSchema.parse(sessionValue)
          sessionToken = sessionTokenSchema.parse(await readClerkJson(
            input.fetch, `${CLERK_API}/sessions/${encodeURIComponent(session.id)}/tokens`,
            { method: 'POST', headers }, 'clerk_temporary_session_token_failed',
          )).jwt
          return sessionToken
        },
      })
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
type TemporaryClerkApiKeyInput<T> = Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  expectedPrimaryEmail?: string
  requiredScope?: string
  scopes?: readonly string[]
  fetch: typeof globalThis.fetch
  run: (apiKey: string, identity: Readonly<{ credentialId: string }>) => Promise<T>
  keyNamePrefix?: string
  revocationReason?: string
  requireRevocationReadback?: boolean
  returnEvidence?: boolean
}>

export function withTemporaryClerkApiKey<T>(
  input: TemporaryClerkApiKeyInput<T> & Readonly<{
    requiredScope: 'paid_operation:invoke'
    scopes: readonly ['paid_operation:invoke']
    requireRevocationReadback: true
    returnEvidence: true
  }>,
): Promise<Readonly<{
  value: T
  revocation: TemporaryClerkApiKeyRevocationEvidence
}>>
export function withTemporaryClerkApiKey(
  input: TemporaryClerkApiKeyInput<void> & Readonly<{ returnEvidence?: false }>,
): Promise<void>
export async function withTemporaryClerkApiKey<T>(
  input: TemporaryClerkApiKeyInput<T>,
): Promise<void | Readonly<{
  value: T
  revocation: TemporaryClerkApiKeyRevocationEvidence
}>> {
  const headers = await clerkAcceptanceHeaders({
    ...input,
    expectedPrimaryEmail:
      input.expectedPrimaryEmail ?? ACCEPTANCE_PRIMARY_EMAIL,
  })
  return await withTemporaryAgentKey({ ...input, headers, run: input.run })
}
type TemporaryClerkUserSessionInput<T> = Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  expectedPrimaryEmail: string
  fetch: typeof globalThis.fetch
  run: (sessionToken: string) => Promise<T>
  requireRevocationReadback?: boolean
  returnEvidence?: boolean
}>

export function withTemporaryClerkUserSession<T>(
  input: TemporaryClerkUserSessionInput<T> & Readonly<{
    requireRevocationReadback: true
    returnEvidence: true
  }>,
): Promise<Readonly<{
  value: T
  revocation: TemporaryClerkSessionRevocationEvidence
}>>
export function withTemporaryClerkUserSession(
  input: TemporaryClerkUserSessionInput<void> & Readonly<{ returnEvidence?: false }>,
): Promise<void>
export async function withTemporaryClerkUserSession<T>(
  input: TemporaryClerkUserSessionInput<T>,
): Promise<void | Readonly<{
  value: T
  revocation: TemporaryClerkSessionRevocationEvidence
}>> {
  const headers = await clerkAcceptanceHeaders(input)
  let sessionId: string | undefined
  let runResult: T | undefined
  let runError: unknown
  try {
    const sessionValue = await readClerkJson(input.fetch, `${CLERK_API}/sessions`, {
      method: 'POST', headers, body: JSON.stringify({ user_id: input.subject }),
    }, 'clerk_temporary_session_creation_failed')
    sessionId = createdSessionIdentitySchema.parse(sessionValue).id
    const session = createdSessionSchema.parse(sessionValue)
    const sessionToken = sessionTokenSchema.parse(await readClerkJson(
      input.fetch, `${CLERK_API}/sessions/${encodeURIComponent(session.id)}/tokens`,
      { method: 'POST', headers }, 'clerk_temporary_session_token_failed',
    )).jwt
    runResult = await input.run(sessionToken)
  } catch (error) {
    runError = error
  }

  const revocationFailure = sessionId === undefined
    ? undefined
    : await revokeTemporarySession(input.fetch, headers, sessionId)
  let revocationEvidence: TemporaryClerkSessionRevocationEvidence | undefined
  let readbackFailure: Error | undefined
  if (sessionId !== undefined
    && revocationFailure === undefined
    && input.requireRevocationReadback === true) {
    try {
      const readback = revokedSessionReadbackSchema.parse(await readClerkJson(
        input.fetch,
        `${CLERK_API}/sessions/${encodeURIComponent(sessionId)}`,
        { headers },
        'clerk_temporary_session_revocation_readback_failed',
      ))
      if (readback.id !== sessionId || readback.user_id !== input.subject) {
        throw new Error('clerk_temporary_session_revocation_readback_mismatch')
      }
      revocationEvidence = {
        sessionId: readback.id,
        subject: readback.user_id,
        status: 'revoked',
      }
    } catch (error) {
      readbackFailure = error instanceof Error
        ? error
        : new Error('clerk_temporary_session_revocation_readback_failed')
    }
  }
  const cleanupFailure = revocationFailure ?? readbackFailure
  if (runError !== undefined && cleanupFailure !== undefined) {
    throw new AggregateError([runError, cleanupFailure], 'session journey and revocation both failed')
  }
  if (runError !== undefined) throw runError
  if (cleanupFailure !== undefined) throw cleanupFailure
  if (input.returnEvidence === true) {
    if (runResult === undefined || revocationEvidence === undefined) {
      throw new Error('clerk_temporary_session_revocation_evidence_missing')
    }
    return { value: runResult, revocation: revocationEvidence }
  }
}
async function clerkAcceptanceHeaders(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  expectedPrimaryEmail: string
  fetch: typeof globalThis.fetch
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
  assertAcceptanceUser(user, input.subject, input.expectedPrimaryEmail)
  return headers
}

async function withTemporaryAgentKey<T>(input: Readonly<{
  subject: string
  fetch: typeof globalThis.fetch
  headers: Record<string, string>
  requiredScope?: string
  scopes?: readonly string[]
  keyNamePrefix?: string
  revocationReason?: string
  run: (apiKey: string, identity: Readonly<{ credentialId: string }>) => Promise<T>
  requireRevocationReadback?: boolean
  returnEvidence?: boolean
}>): Promise<void | Readonly<{
  value: T
  revocation: TemporaryClerkApiKeyRevocationEvidence
}>> {
  const scopes = temporaryKeyScopes(input.scopes, input.requiredScope)
  if ((input.requireRevocationReadback === true || input.returnEvidence === true)
    && (input.requiredScope !== 'paid_operation:invoke'
      || scopes.length !== 1
      || scopes[0] !== 'paid_operation:invoke')) {
    throw new Error('temporary_paid_operation_key_contract_invalid')
  }
  const createdValue = await readClerkJson(input.fetch, `${CLERK_API}/api_keys`, {
    method: 'POST', headers: input.headers,
    body: JSON.stringify({
      name: `${input.keyNamePrefix ?? 'AE production cold-agent acceptance'} ${randomUUID()}`,
      subject: input.subject,
      scopes,
      seconds_until_expiration: 3_600,
    }),
  }, 'clerk_temporary_api_key_creation_failed')
  const createdIdentity = createdKeyIdentitySchema.parse(createdValue)

  let journeyResult: T | undefined
  let journeyError: unknown
  try {
    const created = createdKeySchema.parse(createdValue)
    journeyResult = await input.run(created.secret, { credentialId: created.id })
  } catch (error) {
    journeyError = error
  }
  let revocationFailure: Error | undefined
  try {
    const response = await input.fetch(
      `${CLERK_API}/api_keys/${encodeURIComponent(createdIdentity.id)}/revoke`,
      {
        method: 'POST', headers: input.headers,
        body: JSON.stringify({
          revocation_reason:
            input.revocationReason ?? 'Temporary production acceptance completed',
        }),
      },
    )
    if (!response.ok) {
      revocationFailure = new Error(
        `clerk_temporary_api_key_revocation_failed:${response.status}`,
      )
    }
  } catch (error) {
    revocationFailure = new Error('clerk_temporary_api_key_revocation_failed', { cause: error })
  }

  let revocationEvidence: TemporaryClerkApiKeyRevocationEvidence | undefined
  let readbackFailure: Error | undefined
  if (revocationFailure === undefined && input.requireRevocationReadback === true) {
    try {
      const readback = revokedKeyReadbackSchema.parse(await readClerkJson(
        input.fetch,
        `${CLERK_API}/api_keys/${encodeURIComponent(createdIdentity.id)}`,
        { headers: input.headers },
        'clerk_temporary_api_key_revocation_readback_failed',
      ))
      if (readback.id !== createdIdentity.id
        || readback.subject !== input.subject
        || readback.scopes.length !== 1
        || readback.scopes[0] !== 'paid_operation:invoke') {
        throw new Error('clerk_temporary_api_key_revocation_readback_mismatch')
      }
      revocationEvidence = {
        credentialId: readback.id,
        subject: readback.subject,
        scopes: [...readback.scopes],
        status: 'revoked',
        secondsUntilExpiration: 3_600,
      }
    } catch (error) {
      readbackFailure = error instanceof Error
        ? error
        : new Error('clerk_temporary_api_key_revocation_readback_failed')
    }
  }
  const cleanupFailure = revocationFailure ?? readbackFailure
  if (journeyError !== undefined && cleanupFailure !== undefined) {
    throw new AggregateError(
      [journeyError, cleanupFailure],
      'cold journey and temporary key revocation both failed',
    )
  }
  if (journeyError !== undefined) throw journeyError
  if (cleanupFailure !== undefined) throw cleanupFailure
  if (input.returnEvidence === true) {
    if (journeyResult === undefined || revocationEvidence === undefined) {
      throw new Error('clerk_temporary_api_key_revocation_evidence_missing')
    }
    return { value: journeyResult, revocation: revocationEvidence }
  }
}
function temporaryKeyScopes(
  scopes: readonly string[] | undefined,
  requiredScope = DEFAULT_REQUIRED_SCOPE,
): readonly string[] {
  const selected = scopes ?? [requiredScope]
  const allowed = Object.hasOwn(ALLOWED_TEMPORARY_KEY_SCOPES, requiredScope)
    ? ALLOWED_TEMPORARY_KEY_SCOPES[
      requiredScope as keyof typeof ALLOWED_TEMPORARY_KEY_SCOPES
    ]
    : undefined
  if (selected.length === 0 || selected.length > 32
    || selected.some((scope) => !/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/u.test(scope))
    || allowed === undefined
    || !selected.includes(requiredScope)
    || selected.some((scope) => !(allowed as readonly string[]).includes(scope))) {
    throw new Error('temporary_agent_key_scopes_invalid')
  }
  return [...new Set(selected)].sort()
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

function assertAcceptanceUser(
  user: z.infer<typeof userSchema>,
  subject: string,
  expectedPrimaryEmail: string,
): void {
  const primary = user.email_addresses.find((email) => email.id === user.primary_email_address_id)
  if (user.id !== subject || user.banned || user.locked
    || primary?.email_address.toLowerCase() !== expectedPrimaryEmail.trim().toLowerCase()
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
