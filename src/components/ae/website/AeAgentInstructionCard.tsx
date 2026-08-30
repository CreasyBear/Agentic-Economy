import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import {
  AGENT_INSTRUCTION,
  type AgentPasteInstruction,
} from '@/content/brand-copy'

import { AeCornerMarks } from './AeSiteMarks'

type AeAgentInstructionCardProps = {
  framed?: boolean
  headingId?: string
  instruction?: AgentPasteInstruction
}

/** Agent-paste card. Home uses the market instruction; `/for-agents` uses setup. */
export function AeAgentInstructionCard({
  framed = false,
  headingId = 'agent-instruction',
  instruction = AGENT_INSTRUCTION,
}: AeAgentInstructionCardProps) {
  const card = (
    <aside
      aria-labelledby={headingId}
      className={framed ? 'min-w-0 bg-container' : 'min-w-0 border border-border bg-container'}
    >
      <Card className="gap-section rounded-none border-0 py-page shadow-none">
        <CardHeader className="gap-related">
          <h2
            id={headingId}
            className="font-display text-2xl font-medium tracking-tight sm:text-3xl"
          >
            {instruction.heading}
          </h2>
          <CardDescription className="text-pretty text-base leading-7">
            {instruction.body}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AeCopyCommand
            comfortable
            label={instruction.label}
            code={instruction.code}
            copyText={instruction.copyText}
          />
        </CardContent>
      </Card>
    </aside>
  )

  if (framed) return card

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <AeCornerMarks />
      {card}
    </div>
  )
}
