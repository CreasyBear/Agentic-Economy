import type { AeFact } from '@/components/ae/data/AeFactList'
import { formatTimestamp } from '@/lib/ui/format-time'
import { aeStatusPresentation, getStatusPresentation } from '@/lib/ui/status-presentation'
import { formatDisplayAmount, type ExactAmount } from '@/modules/money/public'
import type {
  AgentDetail,
  AgentDirectoryItem,
} from '@/modules/agent-access/agent-operator-view-model'
import type { PendingCallApproval } from '@/modules/capability-execution/call-approval.functions'
import type { AgentConnectionReadback } from '@/modules/agent-access/public'
import { NATIVE_MCP_CLIENTS } from '@/lib/cli-distribution'

type AcceptedApprovalQuote = Extract<NonNullable<PendingCallApproval['decisionContext']>['acceptedQuote'], { kind: 'available' }>

export function approvalFacts(approval: PendingCallApproval): readonly AeFact[] {
  const context = approval.decisionContext
  const acceptedQuote = context?.acceptedQuote.kind === 'available' ? context.acceptedQuote : undefined
  const facts: AeFact[] = [
    {
      label: 'Agent',
      value: context === undefined
        ? 'Agent details unavailable'
        : context.agent.currentDisplayName === null
          ? 'Current Agent name not available'
          : `${context.agent.currentDisplayName} (current account label)`,
    },
    { label: 'Purpose', value: 'Not recorded for this Call' },
    {
      label: 'Provider',
      value: acceptedQuote === undefined
        ? 'Accepted Provider details unavailable'
        : acceptedQuote.provider.name ?? `${acceptedQuote.provider.ref} (name not recorded)`,
    },
    {
      label: 'Maximum AUD spend',
      value: acceptedQuote === undefined ? 'Accepted Quote unavailable' : formatDisplayAmount(acceptedQuote.maximumSpend),
      mono: acceptedQuote !== undefined,
    },
    { label: 'Action class', value: consequenceLabel(approval.authorityRequest.consequence) },
    {
      label: 'Declared effects',
      value: acceptedQuote === undefined ? 'Accepted Tool contract unavailable' : approvalEffectsLabel(acceptedQuote.effects),
    },
    {
      label: 'Declared data release',
      value: acceptedQuote === undefined ? 'Accepted Tool contract unavailable' : approvalDataUseLabel(acceptedQuote.dataUse),
    },
  ]
  return facts
}

export function approvalCanApprove(approval: PendingCallApproval): boolean {
  return approval.decisionContext?.acceptedQuote.kind === 'available'
}

export function approvalToolName(approval: PendingCallApproval): string {
  return approval.decisionContext?.acceptedQuote.kind === 'available'
    ? approval.decisionContext.acceptedQuote.tool.name
    : 'Tool details unavailable'
}

export function approvalToolDescription(approval: PendingCallApproval): string {
  return approval.decisionContext?.acceptedQuote.kind === 'available'
    ? approval.decisionContext.acceptedQuote.tool.description
    : 'The accepted Quote could not be read from this approval source.'
}

function approvalEffectsLabel(effects: AcceptedApprovalQuote['effects']): string {
  if (effects.length === 0) return 'None declared in the accepted Tool contract; this is not a guarantee of no effects.'
  return effects.map(effect => `${effectClassLabel(effect.class)} · ${reversibilityLabel(effect.reversibility)}`).join('; ')
}

function approvalDataUseLabel(dataUse: AcceptedApprovalQuote['dataUse']): string {
  if (dataUse.length === 0) return 'None declared in the accepted Tool contract; this is not a guarantee of no disclosure.'
  return dataUse.map(declaration => {
    const field = declaration.inputPointer.slice(1).replaceAll('~1', '/').replaceAll('~0', '~').replaceAll('/', '.')
    const recipient = declaration.recipient.kind === 'candidate_binding'
      ? 'candidate Provider'
      : declaration.recipient.kind === 'selected_binding'
        ? 'selected Provider'
        : `named recipient ${declaration.recipient.recipientId}`
    const purposes = declaration.purposes.map(humanizeIdentifier).join(', ')
    return `${dataClassificationLabel(declaration.classification)} ${field} to ${recipient} during ${declaration.phase} for ${purposes}`
  }).join('; ')
}

function effectClassLabel(effectClass: 'data_release' | 'financial_exposure' | 'external_state_change'): string {
  if (effectClass === 'data_release') return 'Releases data'
  if (effectClass === 'financial_exposure') return 'Creates financial exposure'
  return 'Changes external state'
}

function reversibilityLabel(reversibility: 'not_applicable' | 'reversible' | 'conditional' | 'irreversible'): string {
  if (reversibility === 'not_applicable') return 'reversibility not applicable'
  if (reversibility === 'conditional') return 'reversibility depends on conditions'
  return reversibility
}

function dataClassificationLabel(classification: 'public' | 'personal' | 'sensitive' | 'credential'): string {
  if (classification === 'public') return 'Public data:'
  if (classification === 'personal') return 'Personal data:'
  if (classification === 'sensitive') return 'Sensitive data:'
  return 'Credential:'
}

function humanizeIdentifier(value: string): string {
  return value.replaceAll(/[._-]+/gu, ' ')
}

export function agentFacts(detail: AgentDetail): readonly AeFact[] {
  const usage = detail.usage
  const calls = usage === undefined
    ? 'Unavailable'
    : `${usage.callCount} this month · ${usage.outcomeUnknownCallCount === 0
      ? 'none need checking'
      : `${usage.outcomeUnknownCallCount} ${usage.outcomeUnknownCallCount === 1 ? 'needs' : 'need'} checking`}`
  return [
    { label: 'Authority', value: scopeLabel(detail.authorityMode) },
    { label: 'Monthly limit', value: detail.spendingPolicy.kind === 'known' ? formatDisplayAmount(detail.spendingPolicy.maximumMonthlySpend) : spendingPolicyStateLabel(detail.spendingPolicy.kind), mono: detail.spendingPolicy.kind === 'known' },
    { label: 'Recent Calls', value: calls },
    { label: 'Last used', value: detail.agent.lastSeenAt === undefined
      ? 'No activity recorded'
      : formatTimestamp(detail.agent.lastSeenAt),
      mono: true },
  ]
}

export function agentSpendingPolicyFacts(detail: AgentDetail): readonly AeFact[] {
  const policy = detail.spendingPolicy
  if (policy.kind !== 'known') {
    return [{ label: 'Spending policy', value: spendingPolicyStateLabel(policy.kind) }]
  }
  return [
    { label: 'Status', value: policy.paused ? 'Paused' : 'Active' },
    { label: 'Per Call', value: formatDisplayAmount(policy.maximumSpendPerCall), mono: true },
    { label: 'Daily budget', value: formatDisplayAmount(policy.maximumDailySpend), mono: true },
    { label: 'Monthly budget', value: formatDisplayAmount(policy.maximumMonthlySpend), mono: true },
    { label: 'Rate', value: detail.grant === undefined ? 'Unavailable' : `${detail.grant.rate.maximumCallsPerMinute}/min · ${detail.grant.rate.maximumCallsPerHour}/hour`, mono: true },
    { label: 'Concurrency', value: detail.grant === undefined ? 'Unavailable' : String(detail.grant.budget.maximumConcurrentCalls), mono: true },
  ]
}

function spendingPolicyStateLabel(kind: AgentDetail['spendingPolicy']['kind']): string {
  if (kind === 'unset') return 'No spending policy set'
  if (kind === 'expired') return 'Expired'
  if (kind === 'unavailable') return 'Unavailable'
  return 'Current'
}

export function agentActivityFacts(detail: AgentDetail): readonly AeFact[] {
  const usage = detail.usage
  const settledCharges = usage === undefined
    ? 'Unavailable'
    : usage.amountCoverage === 'complete' && usage.settledSpend !== undefined
      ? formatAmount(usage.settledSpend)
      : 'Amount coverage incomplete'
  return [
    { label: 'Calls this month', value: usage === undefined ? 'Unavailable' : String(usage.callCount), mono: true },
    { label: 'Completed', value: usage === undefined ? 'Unavailable' : String(usage.completedCallCount), mono: true },
    { label: 'Needs checking', value: usage === undefined ? 'Unavailable' : String(usage.outcomeUnknownCallCount) },
    { label: 'Settled charges', value: settledCharges, mono: true },
    { label: 'Amount coverage', value: usage === undefined ? 'Unavailable' : usage.amountCoverage === 'complete' ? 'Complete' : 'Incomplete' },
    { label: 'Usage data', value: dataLabel(detail.dataState), muted: true },
  ]
}

export function agentAccessFacts(detail: AgentDetail): readonly AeFact[] {
  return [
    { label: 'Environment', value: environmentLabel(detail.agent.environment) },
    { label: 'Authority', value: scopeLabel(detail.authorityMode) },
    { label: 'Tools', value: toolAccessLabel(detail) },
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

export function agentStatusLabel(status: AgentDirectoryItem['status']):
  | typeof aeStatusPresentation.connected.label
  | typeof aeStatusPresentation.needs_attention.label
  | typeof aeStatusPresentation.credential_expired.label
  | typeof aeStatusPresentation.disconnected.label {
  if (status === 'connected') return getStatusPresentation('connected').label
  if (status === 'attention') return getStatusPresentation('needs_attention').label
  if (status === 'expired') return getStatusPresentation('credential_expired').label
  return getStatusPresentation('disconnected').label
}

export function agentStatusBadgeVariant(
  status: AgentDirectoryItem['status'],
): 'success' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'connected':
      return 'success'
    case 'attention':
      return 'warning'
    case 'expired':
      return 'destructive'
    case 'disconnected':
      return 'outline'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

export function monthlySpendLabel(item: AgentDirectoryItem): string {
  const policy = item.spendingPolicy
  if (policy.kind !== 'known') return spendingPolicyStateLabel(policy.kind)
  const ceiling = policy.maximumMonthlySpend
  if (item.monthlySpendCoverage === 'incomplete' || item.monthlySettledSpend === undefined) {
    return `Unavailable / ${formatDisplayAmount(ceiling)}`
  }
  return `${formatDisplayAmount(item.monthlySettledSpend)} / ${formatDisplayAmount(ceiling)}`
}

export function monthlyUtilizationPercent(item: AgentDirectoryItem): number | undefined {
  if (item.spendingPolicy.kind !== 'known' || item.monthlySpendCoverage === 'incomplete') return undefined
  if (item.monthlySettledSpend === undefined) return undefined
  const ceiling = item.spendingPolicy.maximumMonthlySpend
  if (ceiling.currency !== item.monthlySettledSpend.currency) return undefined
  const spendUnits = BigInt(item.monthlySettledSpend.units)
  const ceilingUnits = BigInt(ceiling.units)
  if (ceilingUnits <= 0n) return spendUnits > 0n ? 100 : 0
  const basisPoints = (spendUnits * 10_000n) / ceilingUnits
  const wholePercent = Number(basisPoints / 100n)
  const fraction = Number(basisPoints % 100n)
  return fraction >= 50 ? Math.min(100, wholePercent + 1) : Math.min(100, wholePercent)
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
  if (state === 'active') return getStatusPresentation('connected').label
  if (state === 'expired') return getStatusPresentation('credential_expired').label
  return getStatusPresentation('credential_revoked').label
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
  return amount === undefined ? '—' : formatDisplayAmount(amount)
}
