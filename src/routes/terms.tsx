import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  GitCompareIcon,
  MessageSquareIcon,
  PencilIcon,
  SearchIcon,
  SendIcon,
  StoreIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
    body: 'Use only the contact channels explicitly published on a business page.',
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
    body: 'Providers can manage their published page. Anyone can request a correction when something looks wrong.',
  },
] as const

function TermsRoute() {
  return (
    <AePublicShell>
      <AePageHeader
        title="Terms"
        description="Use AE to find and contact businesses. The business confirms the work."
      />
      <div className="mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4">
          {canDoItems.map(({ icon: Icon, title, body }) => (
            <div key={title} className="grid gap-1">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
              </p>
              <p className="text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-border pt-8">
          <h2 className="mb-4 text-2xl font-semibold tracking-tight text-foreground">
            What these terms mean in practice
          </h2>
          <TermsAccordion />
        </section>

        <section className="flex flex-wrap gap-3 border-t border-border pt-8">
          <Button asChild variant="default" className="min-h-11"><Link to="/">Ask a question</Link></Button>
          <Button asChild variant="secondary" className="min-h-11"><Link to="/privacy/remove-business">Fix a page <ArrowRightIcon aria-hidden="true" /></Link></Button>
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
