import { createServerFn } from '@tanstack/react-start'
import { createAuthenticatedSourceTransport, sourceQuery } from '@/lib/server/convex-source'
import { createConvexMoneyQueryPort, MoneyQueryError } from '@/lib/server/money-query'
import { listCreditActivity, readCreditAccount, readKeyUsage, type MoneyQueryPort } from '@/modules/money/public'
import { listAgentAccessKeysServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import type { AgentOperatorKeyReadback } from '@/modules/agent-access/agent-operator-view-model'

export type AgentAccessConsoleReadback = readonly AgentOperatorKeyReadback[]
const listOwnerGrantReadbacksQuery = sourceQuery<Record<string, never>, readonly AgentAccessOwnerGrantReadback[]>(
  'agentAccessPolicy:listOwnerGrantReadbacks',
)


export const readAgentAccessConsoleServer = createServerFn({ method: 'GET' })
  .handler(async () => loadAgentAccessConsoleReadback())

export async function loadAgentAccessConsoleReadback(): Promise<AgentAccessConsoleReadback> {
  const [keys, source] = await Promise.all([
    listAgentAccessKeysServer(),
    createAuthenticatedSourceTransport(),
  ])
  const grants = await source.query(listOwnerGrantReadbacksQuery, {})
  return await readAgentAccessMoneyReadback(keys, createConvexMoneyQueryPort(), grants)
}

export async function readAgentAccessMoneyReadback(
  keys: readonly AgentAccessKeyInventoryItem[],
  port: MoneyQueryPort,
  grants: readonly AgentAccessOwnerGrantReadback[] = [],
): Promise<AgentAccessConsoleReadback> {
  const grantsByCredential = new Map(grants.map((grant) => [grant.credentialId, grant]))
  return await Promise.all(keys.map(async (key) => {
    const principalId = `clerk_api_key:${key.keyId}`
    const grant = grantsByCredential.get(key.keyId)
    try {
      const [account, activity, usage] = await Promise.all([
        readCreditAccount({ port, query: { principalId, currency: 'USD' } }),
        listCreditActivity({ port, query: { principalId, credentialId: key.keyId, currency: 'USD', paginationOpts: { numItems: 50, cursor: null } } }),
        readKeyUsage({ port, query: { principalId, credentialId: key.keyId, currency: 'USD' } }),
      ])
      return { key, ...(grant === undefined ? {} : { grant }), principalId, account, activity: activity.page, usage, dataState: 'source' as const }
    } catch (error) {
      const dataState = error instanceof MoneyQueryError && error.code === 'billing_identity_missing' ? 'empty' as const : 'unavailable' as const
      return { key, ...(grant === undefined ? {} : { grant }), principalId, activity: [], dataState }
    }
  }))
}
