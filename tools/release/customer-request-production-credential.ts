import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import { uniqueSorted } from '../../src/modules/common/unique-sorted'

import {
  customerRequestProductionSmokeConfigFromEnvironment,
  runCustomerRequestProductionSmoke,
} from './customer-request-production-smoke'

const REQUIRED_SCOPE = 'customer_requests:create'
const ACCEPTANCE_SCOPES = [REQUIRED_SCOPE, 'customer_requests:approve_each'] as const
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
const runtimeCandidateSchema = z.looseObject({
  id: z.unknown().optional(),
  banned: z.unknown().optional(),
  locked: z.unknown().optional(),
  disabled: z.unknown().optional(),
  status: z.unknown().optional(),
})
const CLERK_USER_LIST_LIMIT = 100
const DEFAULT_RUNTIME_SESSION_LIFETIME_SECONDS = 3_600
const RUNTIME_REVOCATION_REASON = 'work_tree_hosted_parity_complete'

export type RuntimeClerkCredentialSelection = Readonly<{
  seed: string
  candidateCount: number
  selectedSubjectDigest: string
}>

export type RuntimeClerkCredential = Readonly<{
  humanSessionToken: string
  agentApiKey: string
  agentKeyId: string
}>

export type RuntimeSelectedClerkCredentials = Readonly<{
  selection: RuntimeClerkCredentialSelection
  creation: RuntimeClerkCredential
  readback: RuntimeClerkCredential
}>

export async function withTemporaryClerkAcceptanceCredentials(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  fetch: typeof globalThis.fetch
  run: (credentials: Readonly<{
    agentApiKey: string
    credentialId: string
    issueCustomerSessionToken: () => Promise<string>
  }>) => Promise<void>
  scopes?: readonly string[]
  keyNamePrefix?: string
  revocationReason?: string
}>): Promise<void> {
  const headers = await clerkAcceptanceHeaders({ ...input, expectedPrimaryEmail: ACCEPTANCE_PRIMARY_EMAIL })
  await withTemporaryAgentKey({ ...input, headers, run: async (agentApiKey, identity) => {
    let sessionId: string | undefined
    let sessionToken: string | undefined
    let journeyError: unknown
    try {
      await input.run({
        agentApiKey,
        credentialId: identity.credentialId,
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

export async function withTemporaryClerkApiKey(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  scopes?: readonly string[]
  fetch: typeof globalThis.fetch
  run: (apiKey: string, identity: Readonly<{ credentialId: string }>) => Promise<void>
  keyNamePrefix?: string
  revocationReason?: string
}>): Promise<void> {
  const headers = await clerkAcceptanceHeaders({ ...input, expectedPrimaryEmail: ACCEPTANCE_PRIMARY_EMAIL })
  await withTemporaryAgentKey({ ...input, headers, run: input.run })
}

export async function withTemporaryClerkUserSession(input: Readonly<{
  clerkSecretKey: string
  expectedInstanceId: string
  subject: string
  expectedPrimaryEmail: string
  fetch: typeof globalThis.fetch
  run: (sessionToken: string) => Promise<void>
}>): Promise<void> {
  const headers = await clerkAcceptanceHeaders(input)
  let sessionId: string | undefined
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
    await input.run(sessionToken)
  } catch (error) {
    runError = error
  }
  const revocationFailure = sessionId === undefined
    ? undefined
    : await revokeTemporarySession(input.fetch, headers, sessionId)
  if (runError !== undefined && revocationFailure !== undefined) {
    throw new AggregateError([runError, revocationFailure], 'session journey and revocation both failed')
  }
  if (runError !== undefined) throw runError
  if (revocationFailure !== undefined) throw revocationFailure
}
export async function withRuntimeSelectedClerkCredentials(
  input: Readonly<{
    clerkSecretKey: string
    clerkInstanceId: string
    selectionSeed?: string | undefined
    scopes: readonly string[]
    keyNamePrefix: string
    sessionLifetimeSeconds?: number | undefined
    fetch?: typeof globalThis.fetch | undefined
  }>,
  callback: (credentials: RuntimeSelectedClerkCredentials) => Promise<void>,
): Promise<void> {
  const fetch = input.fetch ?? globalThis.fetch
  const seed = runtimeSelectionSeed(input.selectionSeed)
  const scopes = temporaryKeyScopes(input.scopes)
  const sessionLifetimeSeconds = runtimeSessionLifetimeSeconds(input.sessionLifetimeSeconds)
  const keyNamePrefix = runtimeKeyNamePrefix(input.keyNamePrefix)
  const headers = await clerkRuntimeHeaders({
    clerkSecretKey: input.clerkSecretKey,
    clerkInstanceId: input.clerkInstanceId,
    fetch,
  })
  const candidates = await listRuntimeClerkCandidates(fetch, headers)
  if (candidates.length === 0) throw new Error('clerk_candidate_selection_empty')
  const selectedSubject = candidates[runtimeSelectionIndex(seed, candidates.length)]
  if (selectedSubject === undefined) throw new Error('clerk_candidate_selection_empty')

  const credentials = {
    selection: {
      seed,
      candidateCount: candidates.length,
      selectedSubjectDigest: canonicalDigest(selectedSubject),
    },
  }
  let creation: RuntimeCredentialResource | undefined
  let readback: RuntimeCredentialResource | undefined
  let primaryError: unknown
  let failed = false
  try {
    creation = await createRuntimeCredentialResource({
      fetch, headers, subject: selectedSubject, scopes, keyNamePrefix: `${keyNamePrefix} creation`,
      sessionLifetimeSeconds,
    })
    readback = await createRuntimeCredentialResource({
      fetch, headers, subject: selectedSubject, scopes, keyNamePrefix: `${keyNamePrefix} readback`,
      sessionLifetimeSeconds,
    })
    await callback({
      ...credentials,
      creation: publicRuntimeCredential(creation),
      readback: publicRuntimeCredential(readback),
    })
  } catch (error) {
    failed = true
    primaryError = error
  }

  const cleanupErrors: Error[] = []
  for (const resource of [readback, creation]) {
    if (resource === undefined) continue
    const sessionFailure = await revokeTemporarySession(fetch, headers, resource.sessionId)
    if (sessionFailure !== undefined) cleanupErrors.push(sessionFailure)
    const keyFailure = await revokeTemporaryKey(fetch, headers, resource.agentKeyId, RUNTIME_REVOCATION_REASON)
    if (keyFailure !== undefined) cleanupErrors.push(keyFailure)
  }
  if (failed) throwWithCleanup(primaryError, cleanupErrors, 'runtime credential callback and cleanup failed', true)
  throwWithCleanup(undefined, cleanupErrors, 'runtime credential cleanup failed', false)
}


type RuntimeCredentialResource = RuntimeClerkCredential & Readonly<{
  sessionId: string
}>

function runtimeSelectionSeed(seed: string | undefined): string {
  const resolved = seed === undefined ? randomUUID() : seed.trim()
  if (resolved.length === 0 || resolved.length > 256 || /[\u0000-\u001f\u007f]/u.test(resolved)) {
    throw new Error('clerk_selection_seed_invalid')
  }
  return resolved
}

function runtimeSessionLifetimeSeconds(seconds: number | undefined): number {
  const resolved = seconds ?? DEFAULT_RUNTIME_SESSION_LIFETIME_SECONDS
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 86_400) {
    throw new Error('clerk_session_lifetime_invalid')
  }
  return resolved
}

function runtimeKeyNamePrefix(prefix: string): string {
  const resolved = prefix.trim()
  if (resolved.length === 0 || resolved.length > 128 || /[\u0000-\u001f\u007f]/u.test(resolved)) {
    throw new Error('clerk_key_name_prefix_invalid')
  }
  return resolved
}

async function clerkRuntimeHeaders(input: Readonly<{
  clerkSecretKey: string
  clerkInstanceId: string
  fetch: typeof globalThis.fetch
}>): Promise<Record<string, string>> {
  assertRuntimeConfigured(input)
  const headers = { Authorization: `Bearer ${input.clerkSecretKey}`, 'Content-Type': 'application/json' }
  const instance = instanceSchema.parse(await readClerkJson(
    input.fetch, `${CLERK_API}/instance`, { headers }, 'clerk_instance_unavailable',
  ))
  if (instance.id !== input.clerkInstanceId) {
    throw new Error(`clerk_instance_mismatch:expected=${input.clerkInstanceId}:actual=${instance.id}`)
  }
  return headers
}

async function listRuntimeClerkCandidates(
  fetch: typeof globalThis.fetch,
  headers: Record<string, string>,
): Promise<readonly string[]> {
  const value = await readClerkJson(
    fetch, `${CLERK_API}/users?limit=${CLERK_USER_LIST_LIMIT}&order_by=created_at`,
    { headers }, 'clerk_candidate_list_failed',
  )
  const users = Array.isArray(value)
    ? value
    : value !== null && typeof value === 'object' && 'data' in value && Array.isArray(value.data)
      ? value.data
      : undefined
  if (users === undefined) throw new Error('clerk_candidate_list_invalid')
  if (users.length > CLERK_USER_LIST_LIMIT) throw new Error('clerk_candidate_list_bound_exceeded')
  const ids = new Set<string>()
  for (const user of users) {
    if (!runtimeCandidateEligible(user)) continue
    const candidate = runtimeCandidateSchema.parse(user)
    const candidateId = typeof candidate.id === 'string' ? candidate.id.trim() : ''
    if (candidateId.length === 0) continue
    ids.add(candidateId)
  }
  return [...ids].sort(compareRuntimeCandidateIds)
}

function runtimeCandidateEligible(value: unknown): boolean {
  const candidate = runtimeCandidateSchema.safeParse(value)
  if (!candidate.success || typeof candidate.data.id !== 'string' || candidate.data.id.trim().length === 0) return false
  if (candidate.data.banned === true || candidate.data.locked === true || candidate.data.disabled === true) return false
  return typeof candidate.data.status !== 'string' || candidate.data.status.toLowerCase() !== 'disabled'
}

function compareRuntimeCandidateIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function runtimeSelectionIndex(seed: string, candidateCount: number): number {
  const digest = canonicalDigest(seed)
  return Number(BigInt(`0x${digest.slice('sha256:'.length)}`) % BigInt(candidateCount))
}


async function createRuntimeCredentialResource(input: Readonly<{
  fetch: typeof globalThis.fetch
  headers: Record<string, string>
  subject: string
  scopes: readonly string[]
  keyNamePrefix: string
  sessionLifetimeSeconds: number
}>): Promise<RuntimeCredentialResource> {
  let agentKeyId: string | undefined
  let sessionId: string | undefined
  try {
    const keyValue = await readClerkJson(input.fetch, `${CLERK_API}/api_keys`, {
      method: 'POST',
      headers: input.headers,
      body: JSON.stringify({
        name: `${input.keyNamePrefix} ${randomUUID()}`,
        subject: input.subject,
        scopes: input.scopes,
        seconds_until_expiration: input.sessionLifetimeSeconds,
      }),
    }, 'clerk_runtime_api_key_creation_failed')
    agentKeyId = createdKeyIdentitySchema.parse(keyValue).id
    const agentApiKey = createdKeySchema.parse(keyValue).secret
    const sessionValue = await readClerkJson(input.fetch, `${CLERK_API}/sessions`, {
      method: 'POST',
      headers: input.headers,
      body: JSON.stringify({ user_id: input.subject }),
    }, 'clerk_runtime_session_creation_failed')
    sessionId = createdSessionIdentitySchema.parse(sessionValue).id
    const session = createdSessionSchema.parse(sessionValue)
    const humanSessionToken = sessionTokenSchema.parse(await readClerkJson(
      input.fetch, `${CLERK_API}/sessions/${encodeURIComponent(session.id)}/tokens`,
      { method: 'POST', headers: input.headers }, 'clerk_runtime_session_token_failed',
    )).jwt
    return { humanSessionToken, agentApiKey, agentKeyId, sessionId }
  } catch (error) {
    const cleanupErrors: Error[] = []
    if (sessionId !== undefined) {
      const failure = await revokeTemporarySession(input.fetch, input.headers, sessionId)
      if (failure !== undefined) cleanupErrors.push(failure)
    }
    if (agentKeyId !== undefined) {
      const failure = await revokeTemporaryKey(input.fetch, input.headers, agentKeyId, RUNTIME_REVOCATION_REASON)
      if (failure !== undefined) cleanupErrors.push(failure)
    }
    throwWithCleanup(error, cleanupErrors, 'runtime credential creation and cleanup failed', true)
    throw new Error('runtime_credential_creation_unreachable')
  }
}

function publicRuntimeCredential(resource: RuntimeCredentialResource): RuntimeClerkCredential {
  const { sessionId: _sessionId, ...credential } = resource
  return credential
}

async function revokeTemporaryKey(
  fetch: typeof globalThis.fetch,
  headers: Record<string, string>,
  keyId: string,
  reason: string,
): Promise<Error | undefined> {
  try {
    const response = await fetch(`${CLERK_API}/api_keys/${encodeURIComponent(keyId)}/revoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ revocation_reason: reason }),
    })
    return response.ok ? undefined : new Error(`clerk_temporary_api_key_revocation_failed:${response.status}`)
  } catch (error) {
    return new Error('clerk_temporary_api_key_revocation_failed', { cause: error })
  }
}

function assertRuntimeConfigured(input: Readonly<{
  clerkSecretKey: string
  clerkInstanceId: string
}>): void {
  if (!input.clerkSecretKey.trim()) throw new Error('CLERK_SECRET_KEY is required')
  if (!/^ins_[A-Za-z0-9]+$/u.test(input.clerkInstanceId)) {
    throw new Error('AE_CUSTOMER_REQUEST_CLERK_INSTANCE_ID must be an exact Clerk instance ID')
  }
}

function throwWithCleanup(
  primaryError: unknown,
  cleanupErrors: readonly Error[],
  message: string,
  hasPrimary: boolean,
): void {
  if (hasPrimary && cleanupErrors.length > 0) {
    throw new AggregateError([primaryError, ...cleanupErrors], message)
  }
  if (hasPrimary) throw primaryError
  if (cleanupErrors.length === 1) throw cleanupErrors[0]
  if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, message)
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

async function withTemporaryAgentKey(input: Readonly<{
  subject: string; fetch: typeof globalThis.fetch; headers: Record<string, string>
  scopes?: readonly string[]
  keyNamePrefix?: string; revocationReason?: string
  run: (apiKey: string, identity: Readonly<{ credentialId: string }>) => Promise<void>
}>): Promise<void> {
  const scopes = temporaryKeyScopes(input.scopes)
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

  let journeyError: unknown
  try {
    const created = createdKeySchema.parse(createdValue)
    await input.run(created.secret, { credentialId: created.id })
  } catch (error) {
    journeyError = error
  }
  let revocationFailure: Error | undefined
  try {
    const response = await input.fetch(`${CLERK_API}/api_keys/${encodeURIComponent(createdIdentity.id)}/revoke`, {
      method: 'POST', headers: input.headers,
      body: JSON.stringify({
        revocation_reason: input.revocationReason ?? 'Temporary production acceptance completed',
      }),
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

function temporaryKeyScopes(scopes: readonly string[] | undefined): readonly string[] {
  const selected = scopes ?? [REQUIRED_SCOPE]
  if (selected.length === 0 || selected.length > 32
    || selected.some((scope) => !/^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/u.test(scope))
    || !selected.includes(REQUIRED_SCOPE)) {
    throw new Error('temporary_agent_key_scopes_invalid')
  }
  return uniqueSorted(selected)
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
    scopes: ACCEPTANCE_SCOPES,
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
