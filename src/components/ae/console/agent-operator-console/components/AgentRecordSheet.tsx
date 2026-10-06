import { ChevronDownIcon } from 'lucide-react'

import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { Button as ArcButton } from '@/components/arc/button/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AeFactList } from '@/components/ae/data/AeFactList'

import './AgentRecordComposition.css'

import { AgentFactsDisclosure } from './AgentFactsDisclosure'
import type { AgentRecordSheetProps } from '../agent-operator-console.contracts'

export function AgentRecordSheet({
  open,
  onOpenChange,
  title,
  description,
  headerFacts,
  showSheetBody,
  recoveryCopy,
  showActivityTruncatedNote,
  spendingPolicyFacts,
  spendingLimitsForm,
  activityFacts,
  activityTable,
  accessFacts,
  authorizedTools,
  connectionReceipts,
  technicalFacts,
  credentialHistory,
  agentHistory,
  removeAgentDisabled,
  onRemoveAgent,
}: AgentRecordSheetProps) {
  return (
    <AeRecordSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      {...(description === undefined ? {} : { description, facts: headerFacts })}
    >
      {!showSheetBody ? null : (
        <div className="arc-market arc-agent-record-body">
          {recoveryCopy === undefined ? null : (
            <p>{recoveryCopy}</p>
          )}
          <p>Counts and settled charges cover Calls created in the current UTC calendar month. Released or refunded payments are excluded. This is not a net-spend statement.</p>
          {showActivityTruncatedNote ? <p>Recent activity shows only the latest 50 Calls by creation time; monthly counts cover the full period when available.</p> : null}
          <AgentFactsDisclosure label="Spending policy" facts={spendingPolicyFacts}>
            {spendingLimitsForm}
          </AgentFactsDisclosure>
          <AgentFactsDisclosure label="Activity" facts={activityFacts}>
            {activityTable}
          </AgentFactsDisclosure>
          <AgentFactsDisclosure label="Tool access" facts={accessFacts}>
            {authorizedTools}
          </AgentFactsDisclosure>
          {connectionReceipts}
          <Collapsible className="arc-market arc-agent-disclosure">
            <CollapsibleTrigger
              render={
                <ArcButton
                  type="button"
                  variant="ghost"
                  size="md"
                  className="arc-agent-disclosure-trigger"
                >
                  Technical details
                  <ChevronDownIcon className="size-4" aria-hidden="true" />
                </ArcButton>
              }
            />
            <CollapsibleContent className="arc-agent-disclosure-content">
              <AeFactList density="compact" facts={technicalFacts} />
              {credentialHistory}
              {agentHistory}
              <ArcButton
                type="button"
                variant="danger"
                size="md"
                disabled={removeAgentDisabled}
                onClick={(event) => onRemoveAgent(event.currentTarget)}
                className="arc-agent-remove-action"
              >
                Remove agent everywhere
              </ArcButton>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </AeRecordSheet>
  )
}
