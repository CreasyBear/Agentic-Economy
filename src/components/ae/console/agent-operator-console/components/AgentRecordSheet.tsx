import { TACTILE } from '@/components/ae/feedback/AeConfirmDialog'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { cn } from '@/lib/utils'

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
        <div className="mt-4 grid gap-3">
          {recoveryCopy === undefined ? null : (
            <p className="text-sm text-muted-foreground">{recoveryCopy}</p>
          )}
          <p className="text-sm text-muted-foreground">Counts and settled charges cover Calls created in the current UTC calendar month. Released or refunded payments are excluded. This is not a net-spend statement.</p>
          {showActivityTruncatedNote ? <p className="text-sm text-muted-foreground">Recent activity shows only the latest 50 Calls by creation time; monthly counts cover the full period when available.</p> : null}
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
          <Collapsible>
            <CollapsibleTrigger
              render={
                <Button type="button" variant="ghost" className="w-fit min-h-touch">
                  Technical details
                </Button>
              }
            />
            <CollapsibleContent className="grid gap-3 pt-2">
              <AeFactList density="compact" facts={technicalFacts} />
              {credentialHistory}
              {agentHistory}
              <Button
                type="button"
                variant="destructive"
                disabled={removeAgentDisabled}
                onClick={(event) => onRemoveAgent(event.currentTarget)}
                className={cn('w-fit min-h-touch', TACTILE)}
              >
                Remove agent everywhere
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </AeRecordSheet>
  )
}
