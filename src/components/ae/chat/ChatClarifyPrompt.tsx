import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { chatClarify } from '@/lib/public/chat-ia'

export type ChatClarifyPromptProps = Readonly<{
  question: string
  choices: readonly [string, string, string]
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
    <div className="sticky bottom-2 z-10 mx-auto max-w-3xl px-gutter">
      <div className="grid gap-related rounded-card border bg-background p-related">
        <p className="text-sm font-medium">{question}</p>
        <div className="flex flex-wrap gap-related">
          {choices.map((choice) => (
            <Button
              key={choice}
              type="button"
              variant="outline"
              className="min-h-touch"
              disabled={disabled}
              onClick={() => onAnswer(choice)}
            >
              {choice}
            </Button>
          ))}
        </div>
        <form
          className="flex flex-wrap items-center gap-related"
          onSubmit={(event) => {
            event.preventDefault()
            const answer = other.trim()
            if (answer.length === 0 || disabled) return
            onAnswer(answer)
          }}
        >
          <Input
            value={other}
            disabled={disabled}
            placeholder={chatClarify.otherPlaceholder}
            aria-label={chatClarify.otherLabel}
            className="min-h-touch min-w-0 flex-1"
            onChange={(event) => setOther(event.target.value)}
          />
          <Button type="submit" className="min-h-touch" disabled={disabled || other.trim().length === 0}>
            {chatClarify.submitOther}
          </Button>
        </form>
      </div>
    </div>
  )
}
