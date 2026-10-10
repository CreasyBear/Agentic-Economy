import { useState, type FormEvent } from 'react'

import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { Textarea } from '@/components/arc/textarea/textarea'
import { useHomeIntentQuestion } from './useHomeIntentQuestion'

const MAX_LENGTH = 500
const COUNT_FROM = 400
const TITLE = 'What should your agent get done?'
const ERRORS = {
  blank: 'Type a goal, or choose Skip.',
  save: 'Could not save. Try again.',
  skip: 'Could not skip. Try again.',
} as const

type Action = 'save' | 'skip'

export function HomeIntentQuestion() {
  const { intent, answer } = useHomeIntentQuestion()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<Action | undefined>()
  const [error, setError] = useState<keyof typeof ERRORS | undefined>()
  const [saved, setSaved] = useState(false)
  if (intent === undefined || intent === null) return null
  if (saved) {
    return <AeSection title={TITLE}><p role="status">Thanks. The AE team will use this to suggest Tools.</p></AeSection>
  }
  if (intent.text !== null) return null

  const submit = async (text: string, action: Action) => {
    setPending(action)
    setError(undefined)
    try {
      await answer({ text })
      if (action === 'save') setSaved(true)
    } catch {
      setError(action)
    } finally {
      setPending(undefined)
    }
  }
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (draft.trim().length === 0) setError('blank')
    else void submit(draft, 'save')
  }

  // Skip shows only while the field is blank, so a typed goal is never discarded by a dismiss.
  return <AeSection title={TITLE}
    description="Optional. The AE team reads your answer to suggest Tools that fit. Leave out personal or confidential details. Skipping hides this question.">
    <form onSubmit={onSubmit} className="arc-agent-connect-actions">
      <Textarea label="Your goal" value={draft} maxLength={MAX_LENGTH} rows={3}
        onChange={(event) => {
          setDraft(event.target.value)
          setError(undefined)
        }}
        description={draft.length >= COUNT_FROM ? `${draft.length} of ${MAX_LENGTH} characters` : `Up to ${MAX_LENGTH} characters.`}
        {...(error === undefined ? {} : { error: ERRORS[error] })} />
      <Button type="submit" loading={pending === 'save'} disabled={pending !== undefined}>Save</Button>
      {draft.trim().length === 0
        ? <Button type="button" variant="secondary" loading={pending === 'skip'} disabled={pending !== undefined} onClick={() => void submit('', 'skip')}>Skip</Button>
        : null}
    </form>
  </AeSection>
}
