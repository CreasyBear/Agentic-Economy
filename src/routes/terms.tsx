import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  GitCompareIcon,
  MessageSquareIcon,
  PencilIcon,
  SearchIcon,
  SendIcon,
  StoreIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Text } from '@astryxdesign/core/Text'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex' },
      { name: 'description', content: 'Plain-language terms for using Agentic Economy to find, compare, and contact businesses.' },
    ],
  }),
  component: TermsRoute,
})

const canDoItems = [
  {
    icon: SearchIcon,
    title: 'Ask for a service',
    body: 'Describe the job and place in normal language.',
  },
  {
    icon: GitCompareIcon,
    title: 'Compare businesses',
    body: 'Read services, areas, update notes, and how to reach them.',
  },
  {
    icon: SendIcon,
    title: 'Start contact',
    body: 'Send a qualified inquiry when the business page offers it.',
  },
] as const

const termsItems = [
  {
    icon: StoreIcon,
    title: 'The business confirms the job',
    body: 'Timing, quote, scope, materials, and availability come from the business reply.',
  },
  {
    icon: MessageSquareIcon,
    title: 'No booking from a message',
    body: 'It is a first-contact request. The business may accept, decline, ask questions, or not reply.',
  },
  {
    icon: PencilIcon,
    title: 'Page details can be fixed',
    body: 'Owners can claim a page. Anyone can request a correction when something looks wrong.',
  },
] as const

function TermsRoute() {
  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Terms"
        title="The deal in plain English."
        description="Use AE to find and contact businesses. The business confirms the work."
      />
      <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-base md:grid-cols-3">
          {canDoItems.map(({ icon: Icon, title, body }) => (
            <Card key={title} padding={5} className="grid h-full gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Text type="large" weight="semibold" color="primary" className="flex items-center gap-2">
                  <Icon className="size-4 text-primary" aria-hidden="true" /> {title}
                </Text>
                <Badge variant="neutral" label="AE" />
              </div>
              <Text color="secondary" display="block">{body}</Text>
            </Card>
          ))}
        </section>

        <section className="grid gap-5 border-t border-border pt-8 md:grid-cols-[0.72fr_1.28fr]">
          <div className="grid content-start gap-2">
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block">
              Keep expectations clear.
            </Text>
          </div>
          <TermsAccordion />
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block">
              Start with what you need.
            </Text>
            <Text as="p" color="secondary" display="block" className="mt-2">
              Ask a question, browse services, or fix a business page.
            </Text>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button label="Ask a question" variant="primary" href="/" />
            <Button label="Fix a page" variant="secondary" href="/privacy/remove-business" endContent={<ArrowRightIcon aria-hidden="true" />} />
          </div>
        </section>
      </main>
    </AePublicShell>
  )
}

function TermsAccordion() {
  const [openItem, setOpenItem] = useState<string>(termsItems[0]?.title ?? '')

  return (
    <div className="grid gap-2">
      {termsItems.map(({ icon: Icon, title, body }) => {
        const isOpen = openItem === title

        return (
          <Collapsible
            key={title}
            className="rounded-sm border bg-card"
            isOpen={isOpen}
            onOpenChange={(nextOpen) => setOpenItem(nextOpen ? title : '')}
            trigger={(
              <span className="flex min-h-12 items-center gap-3 text-left">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <Text type="large" weight="medium" color="primary">{title}</Text>
              </span>
            )}
          >
            <Text as="p" color="secondary" display="block" className="px-4 pb-4 pl-11">{body}</Text>
          </Collapsible>
        )
      })}
    </div>
  )
}
