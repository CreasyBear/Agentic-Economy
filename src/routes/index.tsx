import { useEffect, useRef, useState, type RefObject } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'

import { AeAnswerPromptInput } from '@/components/ae/chat/AeAnswerPromptInput'
import { AeChat } from '@/components/ae/chat/AeChat'
import { AeChatWelcome } from '@/components/ae/chat/AeChatWelcome'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { emitFunnelEvent } from '@/lib/observability/funnel-client'
import { cn } from '@/lib/utils'

const MAX_QUERY_LENGTH = 200
const registryHref = '/registry?q=&limit=10'
const claimHref = '/claim'

type LedgerRow = {
  provider: string
  area: string
  service: string
  responseWindow: string
  responseIsReceipt: boolean
  source: string
}

const ledgerRows: readonly LedgerRow[] = [
  {
    provider: 'Harbour Electrical',
    area: 'Inner west',
    service: 'Switchboards, fault finding',
    responseWindow: 'Business replies after inquiry',
    responseIsReceipt: false,
    source: 'business supplied · 12 Jun',
  },
  {
    provider: 'Meadow Cleaning',
    area: 'North shore',
    service: 'Move-out, office cleaning',
    responseWindow: 'Owner confirms on reply',
    responseIsReceipt: false,
    source: 'last checked · 14 Jun',
  },
  {
    provider: 'Banksia Plumbing',
    area: 'Inner south',
    service: 'Leaks, taps, hot water notes',
    responseWindow: 'Receipt issued when sent',
    responseIsReceipt: true,
    source: 'business supplied · 13 Jun',
  },
]

const proofSpineSteps = [
  { title: 'Published', stamp: 'business supplied · 12 Jun', delay: 'motion-safe:delay-0' },
  { title: 'Source checked', stamp: 'freshness noted · 14 Jun', delay: 'motion-safe:delay-150' },
  { title: 'Inquiry sent', stamp: 'receipt issued · 14 Jun', delay: 'motion-safe:delay-300' },
  { title: 'Business reply', stamp: 'reply received · 15 Jun', delay: 'motion-safe:delay-500' },
] as const

const ENTER_ROW = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500'
const ROW_DELAYS = ['motion-safe:delay-0', 'motion-safe:delay-150', 'motion-safe:delay-300'] as const
/** Reveals content once it scrolls into view; falls back to visible when IntersectionObserver is unavailable. */
function useInView<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (node === null || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.4 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, inView]
}

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

  function handleListBusinessClick() {
    void emitFunnelEvent({ eventType: 'claim_cta_clicked', stage: 'visitor', correlationPrefix: 'home-for-businesses' })
  }

  return (
    <AePublicShell>
      <section className="mx-auto flex min-h-[70dvh] w-full max-w-2xl flex-col justify-center gap-7 px-4 pt-10 pb-8 text-center md:px-6">
        <AeChatWelcome />

        <Card padding={3} className="grid w-full gap-3 bg-card text-start motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:delay-200 motion-safe:duration-500" aria-label="Ask the proof desk">
          <AeAnswerPromptInput
            onSubmit={handleSubmit}
            examples={[
              'Emergency plumber Parramatta',
              'Solar repairs Fremantle',
              'Cleaner for end-of-lease handoff',
            ]}
          />
        </Card>

        <VStack gap={3} align="center" className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:delay-300 motion-safe:duration-500">
          <Button label="Browse the registry" variant="ghost" size="sm" href={registryHref} />
          <Text type="supporting" color="secondary" className="font-mono">
            AE does not book, charge, dispatch, or confirm timing.
          </Text>
        </VStack>
      </section>

      <section aria-label="Comparison ledger example" className="mx-auto w-full max-w-6xl px-4 pb-14 md:px-6 md:pb-20">
        <ComparisonLedgerCard />
      </section>

      <ProofSpineSection />
      <ForBusinessesSection onListBusinessClick={handleListBusinessClick} />
      <ClosingCtaSection />
    </AePublicShell>
  )
}

function ComparisonLedgerCard() {
  return (
    <Card padding={5} className="grid gap-5 bg-surface" aria-labelledby="home-ledger-heading">
      <VStack gap={2}>
        <Badge variant="neutral" label="Comparison ledger" className="w-fit" />
        <Heading id="home-ledger-heading" level={2} textWrap="balance" className="text-2xl tracking-tight sm:text-3xl">
          Published facts only, across placeholder providers.
        </Heading>
        <Text color="secondary" textWrap="pretty" display="block" className="max-w-2xl">
          AE compares what each business publishes and keeps the source note beside it. It does not invent price or availability.
        </Text>
      </VStack>

      <Table density="balanced" dividers="rows" aria-label="Example comparison ledger across placeholder providers">
        <TableHeader>
          <TableRow isHeaderRow>
            <TableHeaderCell scope="col">Provider</TableHeaderCell>
            <TableHeaderCell scope="col">Service area</TableHeaderCell>
            <TableHeaderCell scope="col">Published services</TableHeaderCell>
            <TableHeaderCell scope="col">Response window</TableHeaderCell>
            <TableHeaderCell scope="col">Source note</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ledgerRows.map((row, index) => (
            <TableRow key={row.provider} className={cn(ENTER_ROW, ROW_DELAYS[index] ?? 'motion-safe:delay-300')}>
              <TableCell>
                <Text type="body" weight="semibold" color="primary">
                  {row.provider}
                </Text>
              </TableCell>
              <TableCell>{row.area}</TableCell>
              <TableCell>{row.service}</TableCell>
              <TableCell>
                {row.responseIsReceipt ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-2.5 py-1 font-mono text-2xs font-semibold tabular-nums text-on-accent">
                    {row.responseWindow}
                  </span>
                ) : (
                  row.responseWindow
                )}
              </TableCell>
              <TableCell>
                <span className="font-mono text-2xs tabular-nums text-secondary">{row.source}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function ProofSpineSection() {
  const [spineRef, inView] = useInView<HTMLOListElement>()

  return (
    <section aria-labelledby="proof-spine-heading" className="border-y border-border bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 md:px-6 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:items-start">
        <VStack gap={3}>
          <Heading id="proof-spine-heading" level={2} textWrap="balance" className="text-3xl tracking-tight sm:text-4xl">
            A record that travels, then returns.
          </Heading>
          <Text color="secondary" textWrap="pretty" display="block" className="max-w-sm">
            Each step is dated beside the fact it represents. The final mark turns solid once a business has replied.
          </Text>
        </VStack>

        <ol ref={spineRef} className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4" aria-label="Handoff proof spine">
          {proofSpineSteps.map((step, index) => {
            const isFinal = index === proofSpineSteps.length - 1
            return (
              <li
                key={step.title}
                className={cn(
                  'grid gap-1.5 border-l border-border pl-4 transition-[opacity,transform] duration-500 ease-out sm:border-l-0 sm:border-t sm:pl-0 sm:pt-4',
                  step.delay,
                  inView ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-3 rounded-full border border-accent',
                    isFinal ? 'bg-accent ring-4 ring-accent-muted' : 'bg-surface',
                  )}
                />
                <Text type="supporting" weight="semibold" color="primary" display="block">
                  {step.title}
                </Text>
                <Text type="supporting" color="secondary" className="font-mono tabular-nums" display="block">
                  {step.stamp}
                </Text>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function ForBusinessesSection({ onListBusinessClick }: { onListBusinessClick: () => void }) {
  return (
    <section aria-labelledby="for-businesses-heading" className="mx-auto w-full max-w-6xl px-4 py-14 md:px-6 md:py-20">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center">
        <VStack gap={4}>
          <Heading id="for-businesses-heading" level={2} textWrap="balance" className="text-3xl tracking-tight sm:text-4xl">
            Be listed as a business of record.
          </Heading>
          <Text color="secondary" textWrap="pretty" display="block" className="max-w-lg">
            Publish your service area, response window, and source notes. What you publish becomes the record customers and assistants read before they reach out.
          </Text>
          <Button label="List your business" variant="ghost" href={claimHref} clickAction={onListBusinessClick} className="w-fit" />
        </VStack>

        <Card padding={5} className="grid gap-4 bg-card" aria-label="Published business record example">
          <HStack gap={2} align="center" justify="between">
            <Text type="large" weight="semibold" color="primary" display="block">
              Harbour Electrical
            </Text>
            <Badge variant="neutral" label="Business supplied" />
          </HStack>
          <div className="grid gap-2 border-t border-border pt-3 font-mono text-xs tabular-nums text-secondary">
            <span>business supplied · 12 Jun</span>
            <span>last checked · 14 Jun</span>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-accent bg-accent px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-on-accent">
            receipt issued when sent
          </span>
        </Card>
      </div>
    </section>
  )
}

function ClosingCtaSection() {
  return (
    <section aria-labelledby="closing-cta-heading" className="border-t border-border bg-surface">
      <VStack gap={4} align="center" className="mx-auto w-full max-w-xl px-4 py-14 text-center md:px-6 md:py-16">
        <Heading id="closing-cta-heading" level={2} textWrap="balance" className="text-2xl tracking-tight sm:text-3xl">
          Start with what is published.
        </Heading>
        <Button label="Ask about a service" variant="primary" href="/" icon={<SearchIcon aria-hidden="true" />} />
      </VStack>
    </section>
  )
}
