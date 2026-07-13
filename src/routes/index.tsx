import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '@astryxdesign/core/Button'
import { Heading, Text } from '@astryxdesign/core/Text'
import { z } from 'zod'

import { AeHomeComposer } from '@/components/ae/chat/AeHomeComposer'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

const homeSearchSchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
})

export const Route = createFileRoute('/')({
  validateSearch: homeSearchSchema,
  head: () => ({ meta: [
    { title: 'Agentic Economy | Your agent knows who to call' },
    { name: 'description', content: 'Say what you need. Agentic Economy helps your agent review real business options and choose a clear next step.' },
  ] }),
  component: Home,
})

function Home() {
  const navigate = useNavigate()
  const { q } = Route.useSearch()
  const [initialQuery] = useState(() => sanitizeInitialQuery(q))
  useEffect(() => {
    if (initialQuery.length === 0) return
    void navigate({ to: '/', search: {}, replace: true })
  }, [initialQuery, navigate])

  return (
    <AePublicShell>
      <main>
        <section className="border-b border-border bg-body">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[minmax(0,.72fr)_minmax(24rem,1.28fr)] lg:items-start">
            <div className="grid gap-4 lg:pt-5">
              <Text className="text-sm font-medium text-secondary">Agentic Economy</Text>
              <Heading level={1} textWrap="balance" className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Your agent knows who to call.</Heading>
              <Text type="large" color="secondary">Say what you need. Review real business options and choose what happens next.</Text>
            </div>
            <AeHomeComposer
              initialQuery={initialQuery}
              onThreadCreated={(threadId) => {
                void navigate({ to: '/t/$threadId', params: { threadId } })
              }}
            />
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-14 sm:px-6" aria-labelledby="how-heading">
          <Heading id="how-heading" level={2} className="text-3xl font-semibold">Ask, review, choose.</Heading>
          <ol className="grid gap-5 border-y border-border py-6 sm:grid-cols-3">
            <li className="grid gap-2"><Text className="font-medium">Ask in your own words</Text><Text color="secondary">Start with the outcome, place, and timing you already know.</Text></li>
            <li className="grid gap-2"><Text className="font-medium">Review options and unknowns</Text><Text color="secondary">Compare published facts without inventing what is missing.</Text></li>
            <li className="grid gap-2"><Text className="font-medium">Choose what happens next</Text><Text color="secondary">Keep the decision record or leave by a business page.</Text></li>
          </ol>
          <Button label="For agents" variant="secondary" href="/for-agents" className="w-fit" />
        </section>
      </main>
    </AePublicShell>
  )
}

function sanitizeInitialQuery(query: string | undefined): string {
  if (query === undefined) return ''
  const normalized = query.replace(/\r\n?/g, '\n').trim()
  if (normalized.length === 0 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) return ''
  return normalized.slice(0, 200)
}
