import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import arcButton from '@/components/arc/button/button.module.css'

import type { AgentDetail } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentSpendingLimitsReadResult, AgentSpendingLimitsResult } from '@/modules/agent-access/spending-policy-update'
import type { ExactAmount } from '@/modules/money/public'

import { AeAgentAuthorizedTools } from '../AeAgentAuthorizedTools'
import { AeAgentCallHistoryTable } from '../AeAgentCallHistoryTable'
import { AeAgentConnectionReceipts } from '../AeAgentConnectionReceipts'
import { AeAgentSpendingLimitsForm } from '../spending-limits-form/AeAgentSpendingLimitsForm'
import {
  agentAccessFacts,
  agentActivityFacts,
  agentFacts,
  agentRecoveryCopy,
  agentSpendingPolicyFacts,
  agentStatusLabel,
  technicalAgentFacts,
} from '../agent-operator-console-model'
import type { AgentRecordSheetProps } from './agent-operator-console.contracts'
import type { UseAgentLifecycleDialogResult } from './agent-operator-console.contracts'

type BuildParams = Readonly<{
  selected: AgentDetail | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  lifecycle: UseAgentLifecycleDialogResult
  lifecyclePending?: Readonly<{ kind: 'credential' | 'connection' | 'agent'; ref: string }>
  agentHistory?: ReactNode
  removeAgentDisabled: boolean
  onUpdateSpendingLimits?: (params: {
    principalRef: string
    expectedGeneration: number
    maximumSpendPerCall: ExactAmount
    maximumDailySpend: ExactAmount
    maximumMonthlySpend: ExactAmount
  }) => Promise<AgentSpendingLimitsResult>
  onReadSpendingLimits?: (principalRef: string) => Promise<AgentSpendingLimitsReadResult>
}>

export function buildAgentRecordSheetProps({
  selected,
  open,
  onOpenChange,
  lifecycle,
  lifecyclePending,
  agentHistory,
  removeAgentDisabled,
  onUpdateSpendingLimits,
  onReadSpendingLimits,
}: BuildParams): AgentRecordSheetProps {
  const recovery = selected === undefined ? undefined : agentRecoveryCopy(selected)
  return {
    open,
    onOpenChange,
    title: selected?.agent.displayName ?? 'Agent',
    ...(selected === undefined
      ? {}
      : { description: agentStatusLabel(selected.agent.status), headerFacts: agentFacts(selected) }),
    showSheetBody: selected !== undefined,
    ...(recovery === undefined ? {} : { recoveryCopy: recovery }),
    showActivityTruncatedNote: selected?.activityTruncated === true,
    spendingPolicyFacts: selected === undefined ? [] : agentSpendingPolicyFacts(selected),
    spendingLimitsForm: selected === undefined ? null : (
      <AeAgentSpendingLimitsForm
        detail={selected}
        {...(onUpdateSpendingLimits === undefined ? {} : { onUpdateSpendingLimits })}
        {...(onReadSpendingLimits === undefined ? {} : { onReadSpendingLimits })}
      />
    ),
    activityFacts: selected === undefined ? [] : agentActivityFacts(selected),
    activityTable: selected === undefined ? null : <AeAgentCallHistoryTable activity={selected.activity} />,
    accessFacts: selected === undefined ? [] : agentAccessFacts(selected),
    authorizedTools: selected === undefined ? null : <AeAgentAuthorizedTools detail={selected} />,
    connectionReceipts: selected === undefined ? null : (
      <AeAgentConnectionReceipts
        detail={selected}
        {...(lifecyclePending === undefined ? {} : { lifecyclePending })}
        onDisconnect={(connection, trigger) => lifecycle.requestConnectionDisconnect(selected, connection, trigger)}
      />
    ),
    technicalFacts: selected === undefined ? [] : technicalAgentFacts(selected),
    credentialHistory: selected === undefined ? null : (
      <Link to="/owner/settings/agent-keys" className={`${arcButton.button} ${arcButton.ghost} ${arcButton.md}`}>
        Manage Agent keys and credential history
      </Link>
    ),
    ...(agentHistory === undefined ? {} : { agentHistory }),
    removeAgentDisabled,
    onRemoveAgent: (trigger) => {
      if (selected !== undefined) lifecycle.requestDisconnect(selected, trigger)
    },
  }
}
