import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { AGENT_INSTRUCTION } from '@/content/brand-copy'

import { AeCornerMarks } from './AeSiteMarks'

type AeAgentInstructionCardProps = {
  framed?: boolean
}

/** Shared agent-paste card. Home and `/for-agents` copy must stay identical. */
export function AeAgentInstructionCard({ framed = false }: AeAgentInstructionCardProps) {
  const card = (
    <aside
      aria-labelledby="agent-instruction"
      className={framed ? 'min-w-0 bg-container' : 'min-w-0 border border-border bg-container'}
    >
      <Card className="gap-section rounded-none border-0 py-page shadow-none">
        <CardHeader className="gap-related">
          <h2
            id="agent-instruction"
            className="font-display text-2xl font-medium tracking-tight sm:text-3xl"
          >
            {AGENT_INSTRUCTION.heading}
          </h2>
          <CardDescription className="text-pretty text-base leading-7">
            {AGENT_INSTRUCTION.body}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AeCopyCommand
            comfortable
            label={AGENT_INSTRUCTION.label}
            code={AGENT_INSTRUCTION.code}
            copyText={AGENT_INSTRUCTION.copyText}
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
