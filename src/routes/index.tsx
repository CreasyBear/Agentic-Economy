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
    { title: 'Ask Agentic Economy' },
    { name: 'description', content: 'Start with what you know. Agentic Economy helps you clarify the need and compare understandable business options.' },
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
              <Heading level={1} textWrap="balance" className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                What do you need done?
              </Heading>
              <Text type="large" color="secondary">
                Ask in your own words. AE will find relevant businesses, show what is known, and tell you when there is not enough evidence to choose.
              </Text>
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
          <Heading id="how-heading" level={2} className="text-3xl font-semibold">One question. A grounded next step.</Heading>
          <ol className="grid gap-5 border-y border-border py-6 sm:grid-cols-3">
            <li className="grid gap-2"><Text className="font-medium">Describe the outcome</Text><Text color="secondary">Use ordinary language. Add the place, timing, and limits you already know.</Text></li>
            <li className="grid gap-2"><Text className="font-medium">See the useful answer first</Text><Text color="secondary">AE foregrounds the differences that matter and keeps the underlying evidence available.</Text></li>
            <li className="grid gap-2"><Text className="font-medium">Choose what happens next</Text><Text color="secondary">Refine, compare, share, or leave by a business page. Nothing is sent automatically.</Text></li>
          </ol>
          <Button label="Browse businesses" variant="secondary" href="/registry" className="w-fit" />
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
