import { ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/arc/button/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { recordProductJourney } from '@/lib/observability/product-journey'

/** Optional orientation alongside full discovery, using the installed disclosure pattern. */
export function MarketUseGuide() {
  return <Collapsible className="arc-market my-4" onOpenChange={open => {
    if (open) recordProductJourney({ action: 'guide_opened', phase: 'observed', surface: 'market' })
  }}>
    <CollapsibleTrigger render={<Button type="button" variant="ghost" className="min-h-touch">
      How Aecon works<ChevronDownIcon aria-hidden="true" className="size-4" />
    </Button>} />
    <CollapsibleContent className="space-y-3 px-4 py-3 text-sm">
      <p>Find an outside service for the task you already have. Browse freely, or search and compare Tools by their inputs, price and expected result.</p>
      <p>For a Tool callable through Aecon, connect your Agent when you are ready. Review who receives the input and the permissions and spending limits you grant. A fresh Quote confirms the price and expires if unused; permission and account balance are separate.</p>
      <p>After an authorized Call, keep its result and receipt. If the outcome is pending or uncertain, check that original Call before retrying. A directory listing with external payment is not an Aecon Call.</p>
      <p className="flex flex-wrap gap-x-5 gap-y-3">
        <a href="/for-agents" className="underline underline-offset-4">Connect your Agent</a>
        <a href="/SKILL.md" className="underline underline-offset-4">Agent playbook</a>
        <a href="/developers/api" className="underline underline-offset-4">Schemas and API</a>
        <a href="/support" className="underline underline-offset-4" onClick={() => recordProductJourney({ action: 'help_opened', phase: 'attempted', surface: 'market' })}>Get help</a>
      </p>
    </CollapsibleContent>
  </Collapsible>
}
