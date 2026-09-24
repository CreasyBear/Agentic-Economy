import type { ProviderConnection } from '@/modules/capability-supply/provider-connection'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { toDomain as providerConnectionDomain } from '../../providerConnections/codecs'

export async function loadProviderConnection(
  db: QueryCtx['db'] | MutationCtx['db'],
  connectionRef: string,
): Promise<ProviderConnection | undefined> {
  const row = await db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef)).unique()
  return row === null ? undefined : providerConnectionDomain(row)
}
