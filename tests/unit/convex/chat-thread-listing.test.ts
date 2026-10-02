import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  rows: [] as Array<{ principalId: string; credentialId: string; ownerId: string; applicationRef: string; environment: 'sandbox' | 'production'; authorityMode: 'spending_policy'; scopes: string[] }>,
}))

vi.mock('../../../convex/authz', () => ({
  resolveBusinessActor: async () => ({ kind: 'authenticated_owner', canonicalAccountRef: 'acct_owner' }),
}))
vi.mock('../../../convex/lib/authority/canonicalAgent/authority', () => ({
  resolveCanonicalAgentContext: async (_ctx: unknown, credentialId: string) => {
    const row = state.rows.find(candidate => candidate.credentialId === credentialId)
    return row === undefined ? null : { principalRef: row.principalId, accountRef: row.ownerId }
  },
}))
vi.mock('../../../convex/lib/capabilityExecution/callLifecycle/agentCallAuthority', () => ({
  resolveCurrentAgentAuthority: async () => ({ grantRef: 'grant_owner_chat' }),
}))

import { resolveOwnerChatActor } from '../../../convex/lib/chat/threads/listing'

const sandbox = {
  principalId: 'principal_sandbox', credentialId: 'credential_sandbox', ownerId: 'acct_owner',
  applicationRef: 'ae-owner-chat', environment: 'sandbox', authorityMode: 'spending_policy', scopes: [],
} as const
const production = {
  ...sandbox, principalId: 'principal_production', credentialId: 'credential_production', environment: 'production',
} as const
const ctx = {
  auth: {},
  db: { query: () => ({ withIndex: () => ({ take: async () => state.rows }) }) },
} as never

afterEach(() => {
  state.rows = []
  vi.unstubAllEnvs()
})

describe('owner chat actor environment', () => {
  it.each([
    ['development', 'principal_sandbox'],
    ['production', 'principal_production'],
  ] as const)('chooses only the %s deployment actor when both are active', async (declaration, principalRef) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)
    state.rows = [{ ...sandbox, scopes: [] }, { ...production, scopes: [] }]
    await expect(resolveOwnerChatActor(ctx)).resolves.toMatchObject({ principalRef, origin: 'owner_chat' })
  })

  it.each([undefined, 'preview'])('refuses an absent or invalid deployment declaration %j', async declaration => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', declaration)
    state.rows = [{ ...sandbox, scopes: [] }]
    await expect(resolveOwnerChatActor(ctx)).resolves.toBeNull()
  })

  it('refuses an actor available only in the opposite environment', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    state.rows = [{ ...sandbox, scopes: [] }]
    await expect(resolveOwnerChatActor(ctx)).resolves.toBeNull()
  })

  it('refuses duplicate active actors in the declared environment', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    state.rows = [{ ...sandbox, scopes: [] }, { ...sandbox, principalId: 'principal_duplicate', credentialId: 'credential_duplicate', scopes: [] }]
    await expect(resolveOwnerChatActor(ctx)).resolves.toBeNull()
  })
})
