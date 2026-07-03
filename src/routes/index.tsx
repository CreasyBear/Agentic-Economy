import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Heading, Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'

import { AeAnswerPromptInput } from '@/components/ae/chat/AeAnswerPromptInput'
import { AeChat } from '@/components/ae/chat/AeChat'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

const MAX_QUERY_LENGTH = 200

export type HomeSearch = {
  q?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    const q = typeof search.q === 'string' ? search.q.slice(0, MAX_QUERY_LENGTH).trim() : ''
    return q.length === 0 ? {} : { q }
  },
  head: () => ({
    meta: [
      { title: 'Ask for a local service | Agentic Economy' },
      {
        name: 'description',
        content:
          'Ask for a local service, compare published business details, and contact the business when an inquiry path is available.',
      },
    ],
  }),
  component: Home,
})

function Home() {
  const { q = '' } = Route.useSearch()

  if (q.length > 0) {
    return <AeChat key={q} initialQuery={q} />
  }

  return <HomeLanding />
}

function HomeLanding() {
  const navigate = useNavigate()

  function handleSubmit(query: string) {
    void navigate({ to: '/', search: { q: query } })
  }

  return (
    <AePublicShell>
      <section
        aria-labelledby="ae-home-heading"
        className="mx-auto grid min-h-dvh w-full max-w-3xl content-center gap-6 px-4 py-12 md:px-6"
      >
        <VStack gap={3}>
          <Text type="label" color="secondary" weight="semibold">
            Agentic Economy
          </Text>
          <Heading id="ae-home-heading" level={1}>
            Ask for a local service. See who fits.
          </Heading>
          <Text type="large" color="secondary" display="block" textWrap="pretty">
            Compare published business details. The business confirms timing, quote, scope, and availability.
          </Text>
        </VStack>
        <AeAnswerPromptInput
          onSubmit={handleSubmit}
          compact
          examples={[
            'Emergency plumber Parramatta',
            'Solar repairs Fremantle',
            'Take an inquiry?',
          ]}
        />
      </section>
    </AePublicShell>
  )
}
