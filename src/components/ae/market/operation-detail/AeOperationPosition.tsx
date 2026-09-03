import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

/** Compact-only actions that locate this Operation in the wider market. */
export function AeOperationPosition({
  operation,
  onNavigate,
}: Readonly<{
  operation: PublicOperationDescriptor
  onNavigate?: () => void
}>) {
  return (
    <div className="grid gap-intra">
      <Button asChild variant="secondary" size="sm" className="min-h-touch justify-self-start">
        <Link
          to="/operations/$operationRef"
          params={{ operationRef: operation.operationRef }}
          data-testid="command-panel-open-operation"
          onClick={onNavigate}
        >
          Open full Operation details
          <ArrowUpRightIcon aria-hidden="true" data-icon="inline-end" />
        </Link>
      </Button>
      <Accordion type="single" collapsible>
        <AccordionItem value="actions" className="rounded-card border bg-card px-related">
          <AccordionTrigger className="min-h-touch py-intra hover:no-underline">
            Actions
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-intra">
              <AeCopyCommand compact label="Operation reference" code={operation.operationRef} />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
