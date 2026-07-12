import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Card } from '@astryxdesign/core/Card'
import { Link } from '@astryxdesign/core/Link'
import { Heading, Text } from '@astryxdesign/core/Text'

import { AeAnswerPromptInput } from '@/components/ae/chat/AeAnswerPromptInput'
import { AeChat } from '@/components/ae/chat/AeChat'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import { cn } from '@/lib/utils'

const MAX_QUERY_LENGTH = 200

const discoveryCategories = [
  { label: 'Plumbing', q: 'Plumbing' },
  { label: 'Electrical', q: 'Electrical' },
  { label: 'Cleaning', q: 'Cleaning' },
  { label: 'Locksmith', q: 'Locksmith' },
] as const

const promptExamples = [
  'Plumber for hot water in Marrickville',
  'End-of-lease cleaner Richmond',
  'Electrician for shopfront lighting',
] as const

const ENTER = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-base motion-safe:ease-standard'
const ENTER_SLOW = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-slow motion-safe:ease-emphasized'

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
      { title: 'Find local businesses | Agentic Economy' },
      {
        name: 'description',
        content: 'Say what you need once, compare local businesses, and reach them in writing.',
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

function handleListBusinessClick(): void {
  void emitFunnelEvent({ eventType: 'claim_cta_clicked', stage: 'visitor', correlationPrefix: 'home-business-link' })
}

function HomeLanding() {
  const navigate = useNavigate()

  function handleSubmit(query: string) {
    void navigate({ to: '/', search: { q: query } })
  }

  return (
    <AePublicShell immersive>
      <section
        aria-labelledby="ae-home-heading"
        className="flex h-full w-full items-center bg-accent text-on-accent"
      >
        <div className="mx-auto grid h-full w-full max-w-6xl items-center gap-5 px-4 pt-5 pb-12 sm:px-6 sm:py-10 lg:grid-cols-2 lg:gap-12 lg:py-12">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 text-left sm:gap-5 lg:mx-0">
            <Heading
              id="ae-home-heading"
              level={1}
              textWrap="balance"
              className={cn('text-5xl font-semibold leading-none text-on-accent sm:text-6xl lg:text-7xl', ENTER)}
            >
              Find a local business. Ask once.
            </Heading>
            <Text
              type="large"
              textWrap="balance"
              display="block"
              className={cn('max-w-xl text-base text-on-accent sm:text-lg', ENTER, 'motion-safe:delay-75')}
            >
              Say what you need once. It reaches the business in writing, no phone tag.
            </Text>

            <Card
              padding={3}
              className={cn('w-full bg-card text-start shadow-high', ENTER, 'motion-safe:delay-100')}
              aria-label="Ask for a local business"
            >
              <AeAnswerPromptInput
                compact
                onSubmit={handleSubmit}
                placeholder="Need a plumber in Marrickville…"
                examples={promptExamples}
              />
            </Card>

            <div className="flex flex-col gap-2">
              <ul className="flex flex-wrap gap-2" aria-label="Browse by category">
                {discoveryCategories.map((category) => (
                  <li key={category.q}>
                    <Link
                      href={`/registry?q=${encodeURIComponent(category.q)}`}
                      color="inherit"
                      className="rounded-full border border-on-accent bg-card px-3 py-1 text-sm font-medium text-primary shadow-low"
                    >
                      {category.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/claim"
                color="inherit"
                hasUnderline
                onClick={handleListBusinessClick}
                className="w-fit text-sm font-medium text-on-accent underline-offset-4"
              >
                Own a business? List it free
              </Link>
            </div>
          </div>

          <InquiryReceiptObject />
        </div>
      </section>
    </AePublicShell>
  )
}

function InquiryReceiptObject() {
  return (
    <Card
      padding={5}
            className={cn('hidden w-full max-w-sm justify-self-end bg-card text-primary shadow-high lg:block lg:-rotate-1', ENTER_SLOW, 'motion-safe:delay-150')}
      aria-label="Example inquiry receipt"
    >
      <div className="grid gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <Text type="supporting" color="secondary" display="block" className="font-mono uppercase tracking-wide">
              Inquiry receipt
            </Text>
            <Text type="large" weight="semibold" color="primary" display="block">
              Banksia Plumbing
            </Text>
          </div>
          <span className="flex size-10 items-center justify-center rounded-full bg-accent font-mono text-sm font-semibold text-on-accent">
            AE
          </span>
        </div>

        <div className="grid gap-3 border-y border-border py-4">
          <ReceiptRow label="Need" value="Hot water system help" />
          <ReceiptRow label="Area" value="Marrickville" />
          <ReceiptRow label="Sent" value="14 Jul, 10:42" />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs tabular-nums text-secondary">AE-2407-18</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-3 py-1 font-mono text-2xs font-semibold uppercase tracking-wide text-on-accent">
            <span className="size-1.5 rounded-full bg-on-accent" aria-hidden="true" />
            sent for owner review
          </span>
        </div>
      </div>
    </Card>
  )
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Text type="supporting" color="secondary" display="block" className="font-mono uppercase tracking-wide">
        {label}
      </Text>
      <Text type="supporting" weight="semibold" color="primary" display="block" className="text-right">
        {value}
      </Text>
    </div>
  )
}
