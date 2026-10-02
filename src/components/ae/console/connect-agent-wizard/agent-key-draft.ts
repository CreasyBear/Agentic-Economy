import { z } from 'zod'

import type {
  ConnectAgentAuthorityMode,
  ConnectAgentEnvironment,
} from './connect-agent-wizard.contracts'

export type AgentKeyDraft = Readonly<{
  name: string
  environment: ConnectAgentEnvironment
  authorityMode: ConnectAgentAuthorityMode
  perCallAmount: string
  dailyAmount: string
  monthlyAmount: string
}>

export type AgentKeyIssueSearch = Readonly<{
  issue?: 'manual'
  name?: string
  authority?: ConnectAgentAuthorityMode
  perCall?: string
  daily?: string
  monthly?: string
}>

export const AGENT_KEY_DRAFT_DEFAULTS: Omit<AgentKeyDraft, 'environment'> = {
  name: '',
  authorityMode: 'spending_policy',
  perCallAmount: '5.00',
  dailyAmount: '25.00',
  monthlyAmount: '100.00',
}

const DRAFT_AMOUNT = /^\d{1,6}(\.\d{1,2})?$/u

export function isAgentKeyDraftDirty(draft: AgentKeyDraft): boolean {
  return draft.name.length > 0
    || draft.authorityMode !== AGENT_KEY_DRAFT_DEFAULTS.authorityMode
    || draft.perCallAmount !== AGENT_KEY_DRAFT_DEFAULTS.perCallAmount
    || draft.dailyAmount !== AGENT_KEY_DRAFT_DEFAULTS.dailyAmount
    || draft.monthlyAmount !== AGENT_KEY_DRAFT_DEFAULTS.monthlyAmount
}

export function agentKeyDraftFromSearch(search: AgentKeyIssueSearch, environment: ConnectAgentEnvironment): AgentKeyDraft {
  return {
    name: search.name ?? AGENT_KEY_DRAFT_DEFAULTS.name,
    environment,
    authorityMode: search.authority ?? AGENT_KEY_DRAFT_DEFAULTS.authorityMode,
    perCallAmount: search.perCall ?? AGENT_KEY_DRAFT_DEFAULTS.perCallAmount,
    dailyAmount: search.daily ?? AGENT_KEY_DRAFT_DEFAULTS.dailyAmount,
    monthlyAmount: search.monthly ?? AGENT_KEY_DRAFT_DEFAULTS.monthlyAmount,
  }
}

export function navigateAgentKeyIssueSearch(
  navigate: (options: {
    to: '/owner/settings/agent-keys'
    search: AgentKeyIssueSearch
    replace: boolean
  }) => Promise<void>,
  nextOpen: boolean,
  nextDraft: AgentKeyDraft,
  replace: boolean,
): void {
  void navigate({
    to: '/owner/settings/agent-keys',
    search: agentKeySearchFromDraft(nextOpen, nextDraft),
    replace,
  })
}

export function agentKeySearchFromDraft(open: boolean, draft: AgentKeyDraft): AgentKeyIssueSearch {
  if (!open) return {}
  return {
    issue: 'manual',
    ...(draft.name.length > 0 ? { name: draft.name } : {}),
    ...(draft.authorityMode === AGENT_KEY_DRAFT_DEFAULTS.authorityMode ? {} : { authority: draft.authorityMode }),
    ...(draft.perCallAmount === AGENT_KEY_DRAFT_DEFAULTS.perCallAmount ? {} : { perCall: draft.perCallAmount }),
    ...(draft.dailyAmount === AGENT_KEY_DRAFT_DEFAULTS.dailyAmount ? {} : { daily: draft.dailyAmount }),
    ...(draft.monthlyAmount === AGENT_KEY_DRAFT_DEFAULTS.monthlyAmount ? {} : { monthly: draft.monthlyAmount }),
  }
}

function draftAmount(value: unknown): string | undefined {
  return typeof value === 'string' && DRAFT_AMOUNT.test(value) ? value : undefined
}

export function validateAgentKeyIssueSearch(search: Record<string, unknown>): AgentKeyIssueSearch {
  const issue = z.object({ issue: z.literal('manual').optional() }).parse(search).issue
  const name = typeof search.name === 'string' && search.name.length <= 80 ? search.name : undefined
  const authority = search.authority === 'spending_policy'
    || search.authority === 'read_only'
    || search.authority === 'approval_required'
    ? search.authority
    : undefined
  const perCall = draftAmount(search.perCall)
  const daily = draftAmount(search.daily)
  const monthly = draftAmount(search.monthly)
  return {
    ...(issue === undefined ? {} : { issue }),
    ...(name === undefined ? {} : { name }),
    ...(authority === undefined ? {} : { authority }),
    ...(perCall === undefined ? {} : { perCall }),
    ...(daily === undefined ? {} : { daily }),
    ...(monthly === undefined ? {} : { monthly }),
  }
}
