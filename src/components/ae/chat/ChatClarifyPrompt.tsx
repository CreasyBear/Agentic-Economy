import { useState } from 'react'

import { Button } from '@/components/arc/button/button'
import { AeActionLink } from '@/components/ae/shared/action-link/AeActionLink'
import { Input } from '@/components/arc/input/input'
import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import { chatClarify } from '@/lib/public/chat-ia'

export type ChatClarifyPromptProps = Readonly<{
  question: string
  choices: readonly string[]
  disabled?: boolean
  onAnswer: (answer: string) => void
}>

export function ChatClarifyPrompt({
  question,
  choices,
  disabled = false,
  onAnswer,
}: ChatClarifyPromptProps) {
  const [other, setOther] = useState('')
  return (
    <div className="arc-market sticky bottom-2 z-10 mx-auto max-w-3xl px-gutter">
      <DecisionPanel aria-label={question}>
        <h2 className="arc-decision-heading">{question}</h2>
        <div className="flex flex-wrap gap-related">
          {choices.map((choice) => (
            <AeActionLink
              key={choice}
              type="button"
              variant="secondary"
              labelLayout="wrap"
              className="min-h-touch"
              disabled={disabled}
              onAction={() => onAnswer(choice)}
            >
              {choice}
            </AeActionLink>
          ))}
        </div>
        <form
          className="grid gap-related"
          onSubmit={(event) => {
            event.preventDefault()
            const answer = other.trim()
            if (answer.length === 0 || disabled) return
            onAnswer(answer)
          }}
        >
          <div className="flex flex-wrap items-center gap-related">
            <div className="min-w-0 flex-1">
              <Input
                label={chatClarify.otherLabel}
                value={other}
                disabled={disabled}
                placeholder={chatClarify.otherPlaceholder}
                className="min-h-touch"
                onChange={(event) => setOther(event.target.value)}
              />
            </div>
            <Button type="submit" className="min-h-touch" disabled={disabled || other.trim().length === 0}>
              {chatClarify.submitOther}
            </Button>
          </div>
        </form>
      </DecisionPanel>
    </div>
  )
}
