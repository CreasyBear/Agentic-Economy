import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import type { ClerkClient } from '@clerk/backend'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  issueCustomerRequestAgentKey,
  listCustomerRequestAgentKeys,
  revokeCustomerRequestAgentKey,
} from './agent-access'
import type { AgentKeyCreateInput, AgentKeyRecord } from './agent-access'

import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

const issueInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  idempotencyKey: z.string().trim().min(8).max(128),
  scopes: z.array(z.string()).min(2).max(2).optional(),
  grantRef: z.string().trim().min(1).max(300).optional(),
})

const owner = async (): Promise<{ userId: string } | undefined> => {
  const identity = await auth()
  return identity.isAuthenticated && identity.userId !== null ? { userId: identity.userId } : undefined
}

type ClerkApiKeyLike = Readonly<{
  id: string
  name: string
  subject: string
  revoked: boolean
  expired: boolean
  claims: Record<string, unknown> | null
  scopes?: readonly string[]
  createdAt?: number | null
  expiration?: number | null
  expiresAt?: number | null
}>

type ApiKeyListQuery = Readonly<{ subject: string; includeInvalid: boolean; limit: number }>
type ClerkApiKeysClient = ClerkClient['apiKeys']

type ClerkCustomerRequestAgentKeyApi = Readonly<{
  list: (query: ApiKeyListQuery) => Promise<{ data: readonly AgentKeyRecord[] }>
  create: (input: AgentKeyCreateInput) => Promise<{ id: string; secret?: string }>
  getSecret: (keyId: string) => Promise<{ secret: string }>
  get: (keyId: string) => Promise<AgentKeyRecord>
  revoke: (input: { apiKeyId: string; revocationReason: string }) => Promise<unknown>
}>

export function createClerkCustomerRequestAgentKeyApi(apiKeys: ClerkApiKeysClient): ClerkCustomerRequestAgentKeyApi {
  return {
    list: async (query) => {
      const result = await apiKeys.list(query)
      return { data: result.data.map(normalizeKey) }
    },
    create: async (value) => {
      const created = await apiKeys.create({ ...value, scopes: [...value.scopes] })
      return created.secret === undefined ? { id: created.id } : { id: created.id, secret: created.secret }
    },
    getSecret: async (keyId) => await apiKeys.getSecret(keyId),
    get: async (keyId) => normalizeKey(await apiKeys.get(keyId)),
    revoke: async (value) => await apiKeys.revoke(value),
  }
}

const normalizeKey = (key: ClerkApiKeyLike): AgentKeyRecord => {
  const createdAt = key.createdAt === null || key.createdAt === undefined ? undefined : key.createdAt
  const expiration = key.expiration === null || key.expiration === undefined ? undefined : key.expiration
  const expiresAt = key.expiresAt === null || key.expiresAt === undefined ? undefined : key.expiresAt
  return {
    id: key.id,
    name: key.name,
    subject: key.subject,
    revoked: key.revoked,
    expired: key.expired,
    claims: key.claims,
    ...(key.scopes === undefined ? {} : { scopes: key.scopes }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(expiration === undefined ? {} : { expiration }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  }
}

export const issueCustomerRequestAgentKeyServer = createServerFn({ method: 'POST' })
  .validator((data) => issueInputSchema.parse(data))
  .handler(async ({ data }) => {
    const principal = await owner()
    const api = createClerkCustomerRequestAgentKeyApi(clerkClient().apiKeys)
    const input: Parameters<typeof issueCustomerRequestAgentKey>[0] = {
      principal,
      input: {
        name: data.name,
        idempotencyKey: data.idempotencyKey,
        ...(data.scopes === undefined ? {} : { scopes: data.scopes }),
        ...(data.grantRef === undefined ? {} : { grantRef: data.grantRef }),
      },
      api,
    }
    return await issueCustomerRequestAgentKey(input)
  })

export const listCustomerRequestAgentKeysServer = createServerFn({ method: 'GET' })
  .handler(async () => {
    if (isLocalE2EAuthBypassEnabled()) return []
    const principal = await owner()
    const api = createClerkCustomerRequestAgentKeyApi(clerkClient().apiKeys)
    return await listCustomerRequestAgentKeys({ principal, api })
  })

export const revokeCustomerRequestAgentKeyServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ keyId: z.string().trim().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const principal = await owner()
    const api = createClerkCustomerRequestAgentKeyApi(clerkClient().apiKeys)
    return await revokeCustomerRequestAgentKey({ principal, keyId: data.keyId, api })
  })
