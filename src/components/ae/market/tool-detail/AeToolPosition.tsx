import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'

/** Compact-only actions that locate this Tool in the wider market. */
export function AeToolPosition({
  tool,
  onNavigate,
}: Readonly<{
  tool: PublicToolDescriptor
  onNavigate?: () => void
}>) {
  return (
    <div className="grid gap-intra">
      <Link
        to="/tools/$toolRef"
        params={{ toolRef: tool.toolRef }}
        data-testid="command-panel-open-tool"
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-touch justify-self-start')}
      >
        Open full Tool details
        <ArrowUpRightIcon aria-hidden="true" data-icon="inline-end" />
      </Link>
      <Accordion type="single" collapsible>
        <AccordionItem value="actions" className="rounded-card border bg-card px-related">
          <AccordionTrigger className="min-h-touch py-intra hover:no-underline">
            Actions
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-intra">
              <AeCopyCommand compact label="Tool reference" code={tool.toolRef} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
