import { ChevronDownIcon } from 'lucide-react'

import { Button as ArcButton } from '@/components/arc/button/button'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import './AgentRecordComposition.css'

import type { AgentFactsDisclosureProps } from '../agent-operator-console.contracts'

export function AgentFactsDisclosure({
  label,
  facts,
  children,
}: AgentFactsDisclosureProps) {
  return (
    <Collapsible className="arc-market arc-agent-disclosure">
      <CollapsibleTrigger
        render={
          <ArcButton
            type="button"
            variant="ghost"
            size="md"
            className="arc-agent-disclosure-trigger"
          >
            {label}
            <ChevronDownIcon className="size-4" aria-hidden="true" />
          </ArcButton>
        }
      />
      <CollapsibleContent className="arc-agent-disclosure-content">
        <AeFactList density="compact" facts={facts} />
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
