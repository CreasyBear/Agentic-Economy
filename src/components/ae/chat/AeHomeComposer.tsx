import { useEffect, useRef, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Heading, Text } from '@astryxdesign/core/Text'

import {
  DEFAULT_AE_SEARCH_CONTEXT,
  type NeedTiming,
} from '@/modules/answer/search-context'
import { AeAnswerPromptInput } from './AeAnswerPromptInput'
import { streamAnswerTurnRequest } from './answer-stream'

export type AeHomeComposerProps = {
  initialQuery?: string
  onThreadCreated: (threadId: string) => void
}

export function AeHomeComposer({ initialQuery = '', onThreadCreated }: AeHomeComposerProps) {
  const submittingRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    submittingRef.current = busy
  }, [busy])

  function submit(query: string, timing: NeedTiming, timingDate?: string) {
    if (submittingRef.current) return
    submittingRef.current = true
    setBusy(true)
    setError(false)

    const clientTurnKey = crypto.randomUUID()
    let createdThreadId: string | undefined
    void streamAnswerTurnRequest({
      query,
      searchContext: { ...DEFAULT_AE_SEARCH_CONTEXT, timing, ...(timingDate === undefined ? {} : { timingDate }) },
      clientTurnKey,
      onFrame: () => undefined,
      onThread: ({ threadId }) => {
        createdThreadId = threadId
      },
    }).then(async (outcome) => {
      if (outcome === 'done' && createdThreadId !== undefined) {
        const promoted = await promoteReadableThread(createdThreadId, onThreadCreated)
        if (promoted) return
      }
      submittingRef.current = false
      setBusy(false)
      setError(true)
    })
  }

  return (
    <section aria-labelledby="home-composer-heading" className="grid gap-5 rounded-lg border border-border bg-card p-5 sm:p-7">
      <div className="grid gap-2">
        <Heading id="home-composer-heading" level={2} className="text-xl font-semibold">What do you need?</Heading>
        <Text color="secondary">Describe the outcome and place. Add the timing you already know.</Text>
      </div>
      {error ? (
        <Banner title="We could not start your thread. Your ask is still here." status="error" />
      ) : null}
      <Text type="supporting" color="secondary" role="note">
        Your question becomes a thread with no automatic expiry. Anyone with its link can open it; this browser can delete it from Recent questions.
      </Text>
      <AeAnswerPromptInput
        onSubmit={submit}
        defaultValue={initialQuery}
        busy={busy}
        placeholder="Describe the outcome, place, timing, and limits you already know..."
        inputLabel="What do you need?"
        ariaLabel="Find local service businesses"
        submitLabel="Find businesses"
      />
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Text type="supporting" color="secondary">AE searches published business pages. You decide before anything is sent to a business.</Text>
        <Button label="Browse businesses" variant="secondary" href="/registry" className="shrink-0" />
      </div>
    </section>
  )
}

async function promoteReadableThread(threadId: string, onReadable: (threadId: string) => void): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`/api/answer/threads/${encodeURIComponent(threadId)}`, { credentials: 'same-origin' })
      if (response.ok) {
        const projection: unknown = await response.json()
        if (
          typeof projection === 'object'
          && projection !== null
          && 'turns' in projection
          && Array.isArray(projection.turns)
          && projection.turns.some((turn) => (
            typeof turn === 'object'
            && turn !== null
            && 'status' in turn
            && turn.status === 'complete'
          ))
        ) {
          onReadable(threadId)
          return true
        }
      }
    } catch {
      // The active answer stream remains authoritative while readback catches up.
    }
    const { promise, resolve } = (Promise as PromiseConstructor & {
      withResolvers: <T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void }
    }).withResolvers<void>()
    setTimeout(resolve, 250)
    await promise
  }
  return false
}
