import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  GitCompareIcon,
  MessageSquareIcon,
  PencilIcon,
  SearchIcon,
  SendIcon,
  StoreIcon,
} from 'lucide-react'
import { useState } from 'react'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell, defaultHomeSearch } from '@/components/ae/layout/AePublicShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

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
    body: 'Read published services, areas, source cues, and next steps.',
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
    title: 'A message is not a booking',
    body: 'It is a first-contact request. The business may accept, decline, ask questions, or not reply.',
  },
  {
    icon: PencilIcon,
    title: 'Published details can be fixed',
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
      <main className="ae-public-page mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {canDoItems.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-[var(--ae-amber)]" aria-hidden="true" /> {title}
                  </CardTitle>
                  <Badge variant="outline">AE</Badge>
                </div>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="grid gap-5 border-t border-[var(--ae-public-line)] pt-8 md:grid-cols-[0.72fr_1.28fr]">
          <div className="grid content-start gap-2">
            <p className="font-mono text-xs font-medium tracking-[var(--ae-public-tracking-mono-label)] text-[var(--ae-muted)] uppercase">
              Ground rules
            </p>
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
              Keep the handoff real.
            </h2>
          </div>
          <TermsAccordion />
        </section>

        <section className="flex flex-col gap-4 border-t border-[var(--ae-public-line)] pt-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
              Start with what you need.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ask a question, browse services, or fix a business page.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/" search={defaultHomeSearch}>Ask a question</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/privacy/remove-business">
                Fix a page
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
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
            className="rounded-[var(--ae-radius-sm)] border border-[var(--ae-public-line)] bg-[var(--ae-surface-raised)]"
            open={isOpen}
            onOpenChange={(nextOpen) => setOpenItem(nextOpen ? title : '')}
          >
            <CollapsibleTrigger asChild>
              <button className="group flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left" type="button">
                <Icon className="size-4 shrink-0 text-[var(--ae-amber)]" aria-hidden="true" />
                <span className="font-heading text-base leading-5 font-medium">{title}</span>
                <ChevronDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="px-4 pb-4 pl-11 text-sm leading-6 text-muted-foreground">{body}</p>
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}
