import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  BracesIcon,
  CreditCardIcon,
  GitCompareIcon,
  RefreshCcwIcon,
  SearchIcon,
  StoreIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/terms')({
  head: () => buildPublicPageHead({
    path: '/terms',
    title: 'Terms | Agentic Economy',
    description: 'Plain-language terms for finding, comparing, paying for, and calling Agentic Economy Operations.',
  }),
  component: TermsRoute,
})

const canDoItems = [
  {
    icon: SearchIcon,
    title: 'Find an Operation',
    body: 'Search the catalogue by capability, category, supplier, or task.',
  },
  {
    icon: GitCompareIcon,
    title: 'Compare exact offers',
    body: 'Review price, readiness, access, evidence, and measured facts where they exist.',
  },
  {
    icon: BracesIcon,
    title: 'Call through one boundary',
    body: 'Inspect the exact contract and approve its access and spend requirements before invoking.',
  },
] as const

const termsItems = [
  {
    icon: StoreIcon,
    title: 'The exact Operation sets the terms',
    body: 'Its current contract, supplier, price, readiness, inputs, and access requirements govern the call.',
  },
  {
    icon: CreditCardIcon,
    title: 'Payment is not proof of delivery',
    body: 'A charge records payment activity. Completion and Qualified Use require their own named evidence.',
  },
  {
    icon: RefreshCcwIcon,
    title: 'Replay cannot create a second call or charge',
    body: 'A repeated idempotent request returns the recorded invocation outcome. Uncertain releases follow the recovery and reconciliation rules shown on the Operation.',
  },
] as const

function TermsRoute() {
  return (
    <AePublicPage
      kind="document"
      eyebrow="Legal"
      title="Terms"
      description="Use Agentic Economy to find, inspect, pay for, and call published Operations."
    >
      <div className="ae-rail grid max-w-prose gap-page pb-page">
        <section className="grid gap-related">
          {canDoItems.map(({ icon: Icon, title, body }) => (
            <div key={title} className="grid gap-intra">
              <p className="flex items-center gap-intra font-semibold text-foreground">
                <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
              </p>
              <p className="text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-border pt-section">
          <h2 className="mb-related text-2xl font-semibold tracking-tight text-foreground">
            What these terms mean in practice
          </h2>
          <TermsAccordion />
        </section>

        <section className="flex flex-wrap gap-related border-t border-border pt-section">
          <Button asChild variant="default" className="min-h-touch"><Link to="/market" search={{ window: '30d' }} hash="operations">Browse catalog</Link></Button>
          <Button asChild variant="secondary" className="min-h-touch"><Link to="/for-providers">Publish an Operation <ArrowRightIcon aria-hidden="true" /></Link></Button>
        </section>
      </div>
    </AePublicPage>
  )
}

function TermsAccordion() {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={termsItems[0]?.title ?? ''}
      className="grid gap-intra"
    >
      {termsItems.map(({ icon: Icon, title, body }) => (
        <AccordionItem key={title} value={title} className="rounded-card border bg-card">
          <AccordionTrigger className="flex min-h-touch w-full items-center justify-start gap-related px-gutter py-0 text-start hover:no-underline [&>svg:last-child]:hidden [&[data-state=open]>svg]:rotate-0">
            <Icon className="size-4 shrink-0 text-foreground" aria-hidden="true" />
            <span className="text-lg font-medium text-foreground">{title}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <p className="block px-gutter pb-gutter ps-[calc(var(--spacing-gutter)+var(--spacing-related)+1rem)] text-muted-foreground">{body}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
