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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      { title: 'Terms | Agentic Economy' },
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
      <div className="mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-base md:grid-cols-3">
          {canDoItems.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="grid h-full gap-1.5 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
                </p>
                <Badge variant="outline">AE</Badge>
              </div>
              <p className="block text-muted-foreground">{body}</p>
            </Card>
          ))}
        </section>

        <section className="grid gap-5 border-t border-border pt-8 md:grid-cols-[0.72fr_1.28fr]">
          <div className="grid content-start gap-2">
            <h2 className="text-3xl font-semibold text-foreground">
              Keep expectations clear.
            </h2>
          </div>
          <TermsAccordion />
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold text-foreground">
              Start with what you need.
            </h2>
            <p className="mt-2 text-muted-foreground">
              Ask a question, browse services, or fix a business page.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="default"><a href="/">Ask a question</a></Button>
            <Button asChild variant="secondary"><a href="/privacy/remove-business">Fix a page <ArrowRightIcon aria-hidden="true" /></a></Button>
          </div>
        </section>
      </div>
    </AePublicShell>
  )
}

function TermsAccordion() {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={termsItems[0]?.title ?? ''}
      className="grid gap-2"
    >
      {termsItems.map(({ icon: Icon, title, body }) => (
        <AccordionItem key={title} value={title} className="rounded-sm border bg-card">
          <AccordionTrigger className="flex min-h-12 w-full items-center justify-start gap-3 px-4 py-0 text-left hover:no-underline [&>svg:last-child]:hidden [&[data-state=open]>svg]:rotate-0">
            <Icon className="size-4 shrink-0 text-foreground" aria-hidden="true" />
            <span className="text-lg font-medium text-foreground">{title}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <p className="block px-4 pb-4 pl-11 text-muted-foreground">{body}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
