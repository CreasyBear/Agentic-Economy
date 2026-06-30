import { buildAgentJsonUrl } from '@/modules/answer/public'

import { resolveThreadRegistryQuery } from './follow-up-query'

export function resolveThreadAgentJson(turns: readonly { query: string }[]): {
  needQuery: string
  agentJsonUrl: string
} {
  const needQuery = resolveThreadRegistryQuery(turns) ?? turns.at(-1)?.query ?? ''
  return {
    needQuery,
    agentJsonUrl: buildAgentJsonUrl(needQuery),
  }
}
