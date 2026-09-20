import { Link } from '@tanstack/react-router'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import type { AgentConnectionSectionProps } from '../help.contracts'

export function AgentConnectionSection({ diagnosticCommand }: AgentConnectionSectionProps) {
  return (
    <AeSection
      title="Agent connection"
      description="Use your client's account connection, then return to your task. Connection and spending permission are separate."
    >
      <Link to="/for-agents" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch')}>Review agent setup</Link>
      <Accordion type="single" collapsible className="mt-related">
        <AccordionItem value="diagnostics">
          <AccordionTrigger>Advanced connection diagnostics</AccordionTrigger>
          <AccordionContent className="grid gap-related">
            <p>If you use the AE CLI, this read-only check reports the configured server and account status.</p>
            <AeCopyCommand comfortable label="diagnostic command" code={diagnosticCommand} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </AeSection>
  )
}
