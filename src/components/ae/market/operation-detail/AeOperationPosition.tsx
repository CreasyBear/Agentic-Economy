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

import { inspectCommand } from './operation-inspector-model'

/** Compact-only actions that locate this Operation in the wider market. */
export function AeOperationPosition({
  operation,
}: Readonly<{
  operation: PublicOperationDescriptor
}>) {
  return (
    <div className="grid gap-intra">
      <Button asChild variant="secondary" size="sm" className="min-h-touch justify-self-start">
        <Link
          to="/operations/$operationRef"
          params={{ operationRef: operation.operationRef }}
          data-testid="command-panel-open-operation"
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
              <AeCopyCommand
                compact
                label="Inspect command"
                code={inspectCommand(operation.operationRef)}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
