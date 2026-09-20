import { AeFactList } from '@/components/ae/data/AeFactList'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

import type { AgentFactsDisclosureProps } from '../agent-operator-console.contracts'

export function AgentFactsDisclosure({
  label,
  facts,
  children,
}: AgentFactsDisclosureProps) {
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button type="button" variant="ghost" className="w-fit min-h-touch">
            {label}
          </Button>
        }
      />
      <CollapsibleContent className="grid gap-3 pt-2">
        <AeFactList density="compact" facts={facts} />
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
