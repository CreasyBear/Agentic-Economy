import type { AeFact } from '@/components/ae/data/AeFactList'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount, type ExactAmount } from '@/modules/money/public'
import type {
  AgentDetail,
  AgentDirectoryItem,
} from '@/modules/agent-access/agent-operator-view-model'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'
import { NATIVE_MCP_CLIENTS } from '@/lib/cli-distribution'

export function approvalFacts(approval: PendingCallApproval): readonly AeFact[] {
  const facts: AeFact[] = [
    { label: 'Consequence', value: consequenceLabel(approval.authorityRequest.consequence) },
  ]
  if (approval.authorityRequest.maximumSpend !== undefined) {
    facts.push({ label: 'Maximum spend', value: formatCurrencyAmount(approval.authorityRequest.maximumSpend), mono: true})
  }
  facts.push({
    label: 'Data fields',
    value: approval.authorityRequest.dataFields.length === 0
      ? 'None'
      : approval.authorityRequest.dataFields.join(', '),
  })
  return facts
}

export function agentFacts(detail: AgentDetail): readonly AeFact[] {
  const usage = detail.usage
  const settledCharges = usage === undefined
    ? 'Unavailable'
    : usage.amountCoverage === 'complete' && usage.settledSpend !== undefined
      ? formatAmount(usage.settledSpend)
      : 'Amount coverage incomplete'
  return [
    { label: 'Environment', value: environmentLabel(detail.agent.environment) },
    { label: 'Last used', value: detail.agent.lastSeenAt === undefined
      ? 'No activity recorded'
      : formatTimestamp(detail.agent.lastSeenAt),
      mono: true },
    { label: 'Per call', value: formatAmount(detail.grant?.budget.maximumSpendPerCall), mono: true},
    { label: 'Daily budget', value: formatAmount(detail.grant?.budget.maximumDailySpend), mono: true},
    { label: 'Monthly budget', value: formatAmount(detail.grant?.budget.maximumMonthlySpend), mono: true},
    { label: 'Rate', value: detail.grant === undefined ? 'Unavailable' : `${detail.grant.rate.maximumCallsPerMinute}/min · ${detail.grant.rate.maximumCallsPerHour}/hour`, mono: true},
    { label: 'Concurrency', value: detail.grant === undefined ? 'Unavailable' : String(detail.grant.budget.maximumConcurrentCalls), mono: true},
    { label: 'Authority', value: scopeLabel(detail.authorityMode) },
    { label: 'Tools', value: toolAccessLabel(detail) },
    { label: 'Calls this month', value: usage === undefined ? 'Unavailable' : String(usage.callCount), mono: true },
    { label: 'Completed', value: usage === undefined ? 'Unavailable' : String(usage.completedCallCount), mono: true },
    { label: 'Needs checking', value: usage === undefined ? 'Unavailable' : String(usage.outcomeUnknownCallCount) },
    { label: 'Settled charges', value: settledCharges, mono: true },
    { label: 'Amount coverage', value: usage === undefined ? 'Unavailable' : usage.amountCoverage === 'complete' ? 'Complete' : 'Incomplete' },
    { label: 'Usage data', value: dataLabel(detail.dataState), muted: true },
  ]
}

export function technicalAgentFacts(detail: AgentDetail): readonly AeFact[] {
  return [
    { label: 'Application', value: detail.agent.applicationRef, mono: true },
    { label: 'Credentials', value: String(detail.credentials.length), mono: true },
    { label: 'Current generation', value: detail.agent.currentCredentialGeneration === undefined ? 'None' : String(detail.agent.currentCredentialGeneration), mono: true },
    {
      label: 'Last authenticated',
      value: detail.agent.lastAuthenticatedAt === undefined ? 'Not recorded' : formatTimestamp(detail.agent.lastAuthenticatedAt),
      definition: 'Recorded at most once every 15 minutes for the current credential.',
      mono: true,
    },
    { label: 'Current credential', value: detail.currentCredentialRef === undefined ? 'None' : redactedKeyId(detail.currentCredentialRef), mono: true },
    { label: 'Scopes', value: detail.scopes.length === 0 ? 'None' : detail.scopes.join(', '), mono: true },
  ]
}

export function agentStatusLabel(status: AgentDirectoryItem['status']): 'Connected' | 'Needs attention' | 'Expired' | 'Disconnected' {
  if (status === 'connected') return 'Connected'
  if (status === 'attention') return 'Needs attention'
  if (status === 'expired') return 'Expired'
  return 'Disconnected'
}

export function agentRecoveryCopy(detail: AgentDetail): string | undefined {
  if (detail.agent.status === 'disconnected' || detail.agent.status === 'expired') {
    return 'To reconnect, start a new access request from the agent.'
  }
  if (detail.agent.status === 'attention' || detail.grant === undefined) {
    return 'This agent needs attention. Review its current credential before allowing new work.'
  }
  if (detail.usage !== undefined && detail.usage.outcomeUnknownCallCount > 0) {
    return 'One or more calls needs checking. Reconcile the recorded outcome before retrying.'
  }
  return undefined
}

export function connectionStateLabel(state: AgentConnectionReadback['state']): string {
  if (state === 'active') return 'Connected'
  if (state === 'expired') return 'Expired'
  return 'Revoked'
}

export function reconnectInstructionFor(connectorDisplayName: string): string {
  return NATIVE_MCP_CLIENTS.find(({ displayName }) => displayName === connectorDisplayName)?.reconnectInstruction
    ?? 'Reconnect from the original agent client.'
}

export function consequenceLabel(consequence: PendingCallApproval['authorityRequest']['consequence']): string {
  switch (consequence) {
    case 'read_only':
      return 'Read only'
    case 'communication':
      return 'Sends a communication'
    case 'external_effect':
      return 'Creates an external effect'
    default: {
      const exhaustive: never = consequence
      return exhaustive
    }
  }
}

export function environmentLabel(environment: AgentDirectoryItem['environment']): string {
  switch (environment) {
    case 'sandbox':
      return 'Sandbox'
    case 'production':
      return 'Production'
    default: {
      const exhaustive: never = environment
      return exhaustive
    }
  }
}

export function scopeLabel(mode: AgentDetail['authorityMode']): string {
  switch (mode) {
    case 'read_only':
      return 'Browse only'
    case 'approval_required':
      return 'Ask each time'
    case 'spending_policy':
      return 'Work within limits'
    case 'unrestricted_test_only':
      return 'Custom authority'
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}

export function toolAccessLabel(detail: AgentDetail): string {
  if (detail.grant === undefined) return 'Unavailable'
  if (detail.grant.toolAccess === 'all_admitted') return 'All admitted Tools'
  return detail.grant.toolRefs.length === 0
    ? 'None'
    : `${detail.grant.toolRefs.length} selected ${detail.grant.toolRefs.length === 1 ? 'Tool' : 'Tools'}`
}

export function redactedKeyId(keyId: string): string {
  return keyId.length <= 8 ? '••••' : `•••• ${keyId.slice(-8)}`
}

export function dataLabel(state: AgentDetail['dataState']): string {
  switch (state) {
    case 'source':
      return 'Usage details are available'
    case 'empty':
      return 'No usage yet'
    case 'partial':
      return 'Some usage details are temporarily unavailable'
    case 'unavailable':
      return 'Usage details are temporarily unavailable'
    default: {
      const exhaustive: never = state
      return exhaustive
    }
  }
}

export function formatAmount(amount: ExactAmount | undefined): string {
  return amount === undefined ? '—' : formatCurrencyAmount(amount)
}
