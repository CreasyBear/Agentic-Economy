import { useId, useState } from 'react'

import { Button } from '@/components/arc/button/button'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
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
  const otherInputId = useId()
  return (
    <div className="sticky bottom-2 z-10 mx-auto max-w-3xl px-gutter">
      <DecisionPanel aria-label={question}>
        <h2 className="arc-decision-heading">{question}</h2>
        <div className="flex flex-wrap gap-related">
          {choices.map((choice) => (
            <Button
              key={choice}
              type="button"
              variant="secondary"
              labelLayout="wrap"
              className="min-h-touch"
              disabled={disabled}
              onClick={() => onAnswer(choice)}
            >
              {choice}
            </Button>
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
          <label htmlFor={otherInputId} className="text-sm font-medium">{chatClarify.otherLabel}</label>
          <div className="flex flex-wrap items-center gap-related">
            <input
              id={otherInputId}
              value={other}
              disabled={disabled}
              placeholder={chatClarify.otherPlaceholder}
              className="min-h-touch min-w-0 flex-1"
              onChange={(event) => setOther(event.target.value)}
            />
            <Button type="submit" className="min-h-touch" disabled={disabled || other.trim().length === 0}>
              {chatClarify.submitOther}
            </Button>
          </div>
        </form>
      </DecisionPanel>
    </div>
  )
}
