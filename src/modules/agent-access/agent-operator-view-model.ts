import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import type { CreditAccountView, CreditActivityView, KeyUsageView } from '@/modules/money/public'

/**
 * Presentation-ready readback for one agent credential.
 *
 * The server projection and React surface share this domain-owned contract so
 * server modules never depend on component files.
 */
export type AgentOperatorKeyReadback = Readonly<{
  key: AgentAccessKeyInventoryItem
  grant?: AgentAccessOwnerGrantReadback
  principalId: string
  account?: CreditAccountView
  activity: readonly CreditActivityView[]
  usage?: KeyUsageView
  dataState: 'source' | 'empty' | 'unavailable'
}>
