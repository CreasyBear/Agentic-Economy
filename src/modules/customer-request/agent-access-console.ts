import { createServerFn } from '@tanstack/react-start'
import { createConvexMoneyQueryPort, MoneyQueryError } from '@/lib/server/money-query'
import { listCreditActivity, readCreditAccount, readKeyUsage, type MoneyQueryPort } from '@/modules/money/public'
import { listCustomerRequestAgentKeysServer } from '@/modules/customer-request/agent-access.functions'
import type { CustomerRequestAgentKeyInventoryItem } from '@/modules/customer-request/agent-access'
import type { AgentOperatorKeyReadback } from '@/components/ae/console/AeAgentOperatorConsole'

export type AgentAccessConsoleReadback = readonly AgentOperatorKeyReadback[]

export const readAgentAccessConsoleServer = createServerFn({ method: 'GET' })
  .handler(async () => loadAgentAccessConsoleReadback())

export async function loadAgentAccessConsoleReadback(): Promise<AgentAccessConsoleReadback> {
  const keys = await listCustomerRequestAgentKeysServer()
  return await readAgentAccessMoneyReadback(keys, createConvexMoneyQueryPort())
}

export async function readAgentAccessMoneyReadback(
  keys: readonly CustomerRequestAgentKeyInventoryItem[],
  port: MoneyQueryPort,
): Promise<AgentAccessConsoleReadback> {
  return await Promise.all(keys.map(async (key) => {
    const principalId = `clerk_api_key:${key.keyId}`
    try {
      const [account, activity, usage] = await Promise.all([
        readCreditAccount({ port, query: { principalId, currency: 'USD' } }),
        listCreditActivity({ port, query: { principalId, credentialId: key.keyId, currency: 'USD', paginationOpts: { numItems: 50, cursor: null } } }),
        readKeyUsage({ port, query: { principalId, credentialId: key.keyId, currency: 'USD' } }),
      ])
      return { key, principalId, account, activity: activity.page, usage, dataState: 'source' as const }
    } catch (error) {
      const dataState = error instanceof MoneyQueryError && error.code === 'billing_identity_missing' ? 'empty' as const : 'unavailable' as const
      return { key, principalId, activity: [], dataState }
    }
  }))
}
