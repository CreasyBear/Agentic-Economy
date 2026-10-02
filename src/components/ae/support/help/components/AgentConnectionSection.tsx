import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

import type { AgentConnectionSectionProps } from '../help.contracts'

import '../SupportComposition.css'

export function AgentConnectionSection({ diagnosticCommand }: AgentConnectionSectionProps) {
  return (
    <section className="arc-market arc-support-section">
      <h2>Agent connection</h2>
      <p>Use your client&apos;s account connection, then return to your task. Connection and spending permission are separate.</p>
      <Link to="/for-agents" className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}>Review Agent connection</Link>
      <Accordion type="single" collapsible className="arc-support-diagnostics">
        <AccordionItem value="diagnostics">
          <AccordionTrigger>Advanced connection diagnostics</AccordionTrigger>
          <AccordionContent className="arc-support-diagnostic-body">
            <p>If you use the AE CLI, this read-only check reports the configured server and account status.</p>
            <AeCopyCommand comfortable label="diagnostic command" code={diagnosticCommand} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  )
}
