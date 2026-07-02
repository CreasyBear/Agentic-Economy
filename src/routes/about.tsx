import { Link, createFileRoute } from '@tanstack/react-router'
import {
  BotIcon,
  ChevronDownIcon,
  GitCompareIcon,
  SearchIcon,
  SendIcon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'

import { AeAssistantAnswerPreview } from '@/components/ae/landing/AeAssistantAnswerPreview'
import { AeHandDrawnHero } from '@/components/ae/landing/AeHandDrawnHero'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell, defaultHomeSearch } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { name: 'description', content: 'Agentic Economy helps people find local businesses, compare what they publish, and take the next step.' },
    ],
  }),
  component: AboutRoute,
})

const doesItems = [
  { icon: SearchIcon, label: 'Search by need and place' },
  { icon: GitCompareIcon, label: 'Compare what businesses publish' },
  { icon: SendIcon, label: 'Send a qualified inquiry when available' },
  { icon: BotIcon, label: 'Use the same details with an assistant' },
]

const doesNotItems = [
  'Book work',
  'Take payments',
  'Dispatch jobs',
  'Pretend availability is confirmed',
]

const commerceShift = [
  {
    icon: SearchIcon,
    title: 'Discovery starts as a question',
    body: 'People increasingly ask assistants for outcomes instead of browsing a stack of links.',
  },
  {
    icon: GitCompareIcon,
    title: 'Comparison has to be readable',
    body: 'Assistants need clean business details: service, area, next step, and the limits around each claim.',
  },
  {
    icon: SendIcon,
    title: 'Action still needs context',
    body: 'Some commerce can move straight to checkout. Local services still need the business to confirm fit, timing, and price.',
  },
]

const offerSteps = [
  {
    number: '1',
    title: 'Ask for the job',
    body: 'Describe the service and location in normal language.',
  },
  {
    number: '2',
    title: 'See who fits',
    body: 'Compare businesses by service, area, source, freshness, and next step.',
  },
  {
    number: '3',
    title: 'Interact with the business',
    body: 'Use contact instructions or send a qualified inquiry. The business takes it from there.',
  },
]

function AboutRoute() {
  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="About"
        title="Find the business that fits the job."
        description="Agentic Economy helps people ask for a local service, compare businesses by what they publish, and take the next step without guessing."
      />
      <main className="ae-public-page mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-6 md:grid-cols-[1.25fr_1fr] md:items-center">
          <AeHandDrawnHero
            src="/images/illustration/agent-ledger.png"
            alt="A hand-drawn notebook of local businesses"
            caption="Drawn by hand. Read by assistants."
          />
          <div className="grid gap-4">
            <p className="font-mono text-xs font-medium tracking-[var(--ae-public-tracking-mono-label)] text-[var(--ae-muted)] uppercase">
              Agentic commerce
            </p>
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
              Commerce is moving from browsing to asking.
            </h2>
            <p className="text-pretty leading-7 text-muted-foreground">
              People are starting to ask assistants for outcomes instead of browsing a stack of links. Local services need a more careful version: find businesses, understand what they publish, then interact with the business without pretending the job is already done.
            </p>
            <MobileAccordion
              ariaLabel="Agentic commerce changes"
              className="md:hidden"
              defaultValue="Discovery starts as a question"
              items={commerceShift}
            />
            <div className="hidden gap-3 md:grid">
              {commerceShift.map(({ icon: Icon, title, body }) => (
                <div key={title} className="grid gap-1 rounded-[var(--ae-radius-sm)] border border-[var(--ae-public-line)] bg-[var(--ae-surface-raised)] p-4">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-[var(--ae-amber)]" aria-hidden="true" />
                    <h3 className="font-heading text-base font-medium">{title}</h3>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 border-t border-[var(--ae-public-line)] pt-8 md:grid-cols-[0.75fr_1.25fr] md:items-start">
          <div className="grid gap-2">
            <p className="font-mono text-xs font-medium tracking-[var(--ae-public-tracking-mono-label)] text-[var(--ae-muted)] uppercase">
              Answer shape
            </p>
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
              AE should feel like asking, not filing.
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              The page is for people. The details are structured enough for assistants to read, compare, and route.
            </p>
          </div>
          <AeAssistantAnswerPreview />
        </section>

        <section className="grid gap-5">
          <div className="grid gap-2 md:max-w-2xl">
            <p className="font-mono text-xs font-medium tracking-[var(--ae-public-tracking-mono-label)] text-[var(--ae-muted)] uppercase">
              The offer
            </p>
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
              Use AE to find businesses and start the right conversation.
            </h2>
          </div>
          <MobileOfferTabs />
          <div className="hidden gap-3 md:grid md:grid-cols-3">
            {offerSteps.map(({ number, title, body }) => (
              <Card key={title} className="border-[var(--ae-public-line-strong)]">
                <CardHeader>
                  <CardDescription className="font-mono text-xs">Step {number}</CardDescription>
                  <CardTitle>{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-7 border-t border-[var(--ae-public-line)] pt-8">
          <MobileTrustAccordion />
          <div className="hidden gap-6 md:grid md:grid-cols-[0.85fr_1.15fr]">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <p className="font-mono text-xs font-medium tracking-[var(--ae-public-tracking-mono-label)] text-[var(--ae-muted)] uppercase">
                  What it can do
                </p>
                <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
                  The interaction stays honest.
                </h2>
              </div>
              <div className="grid gap-3">
                {doesItems.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 text-sm">
                    <Icon className="size-4 shrink-0 text-[var(--ae-amber)]" aria-hidden="true" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-[var(--ae-radius-sm)] border border-[var(--ae-eucalyptus)]/25 bg-[var(--ae-eucalyptus)]/10 p-4">
                <h3 className="font-heading text-base font-medium text-[var(--ae-eucalyptus)]">What businesses still decide</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Timing, price, materials, scope, and whether the job is a fit. AE helps the conversation start with better context.
                </p>
              </div>
              <div className="grid gap-2 rounded-[var(--ae-radius-sm)] border border-[var(--ae-oxide)]/25 bg-[var(--ae-oxide)]/5 p-4">
                <h3 className="font-heading text-base font-medium text-[var(--ae-oxide)]">What it does not do</h3>
                <div className="grid gap-2">
                  {doesNotItems.map((label) => (
                    <div key={label} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <XIcon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t border-[var(--ae-public-line)] pt-7 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight md:text-3xl">
                Start with what you need done.
              </h2>
              <p className="mt-2 text-pretty leading-7 text-muted-foreground">
                Ask a question or browse services. AE helps you move from need to business conversation without the usual directory fog.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button asChild>
                <Link to="/" search={defaultHomeSearch}>Ask a question</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/registry" search={{ q: '', limit: 10 }}>Browse services</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </AePublicShell>
  )
}

type AccordionItem = {
  icon: typeof SearchIcon
  title: string
  body: string
}

function MobileAccordion({
  ariaLabel,
  className,
  defaultValue,
  items,
}: {
  ariaLabel: string
  className?: string
  defaultValue: string
  items: readonly AccordionItem[]
}) {
  const [openItem, setOpenItem] = useState(defaultValue)

  return (
    <div aria-label={ariaLabel} className={className}>
      <div className="grid gap-2">
        {items.map(({ icon: Icon, title, body }) => {
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
    </div>
  )
}

function MobileOfferTabs() {
  return (
    <Tabs className="md:hidden" defaultValue="1">
      <TabsList className="grid w-full grid-cols-3 bg-[var(--ae-surface-sunken)]" aria-label="Offer steps">
        {offerSteps.map(({ number }) => (
          <TabsTrigger key={number} value={number}>
            Step {number}
          </TabsTrigger>
        ))}
      </TabsList>
      {offerSteps.map(({ number, title, body }) => (
        <TabsContent key={number} value={number}>
          <div className="rounded-[var(--ae-radius-sm)] border border-[var(--ae-public-line-strong)] bg-[var(--ae-surface-raised)] p-4">
            <p className="font-mono text-xs text-muted-foreground">Step {number}</p>
            <h3 className="mt-1 font-heading text-xl leading-tight font-semibold">{title}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{body}</p>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  )
}

function MobileTrustAccordion() {
  const [openItem, setOpenItem] = useState('can-do')

  return (
    <div className="grid gap-4 md:hidden">
      <div className="grid gap-2">
        <p className="font-mono text-xs font-medium tracking-[var(--ae-public-tracking-mono-label)] text-[var(--ae-muted)] uppercase">
          What it can do
        </p>
        <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
          The interaction stays honest.
        </h2>
      </div>
      <div className="grid gap-2">
        <Collapsible
          className="rounded-[var(--ae-radius-sm)] border border-[var(--ae-public-line)] bg-[var(--ae-surface-raised)]"
          open={openItem === 'can-do'}
          onOpenChange={(nextOpen) => setOpenItem(nextOpen ? 'can-do' : '')}
        >
          <MobileAccordionTrigger title="What AE can do" />
          <CollapsibleContent>
            <div className="grid gap-3 px-4 pb-4">
              {doesItems.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <Icon className="size-4 shrink-0 text-[var(--ae-amber)]" aria-hidden="true" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          className="rounded-[var(--ae-radius-sm)] border border-[var(--ae-eucalyptus)]/25 bg-[var(--ae-eucalyptus)]/10"
          open={openItem === 'business-decides'}
          onOpenChange={(nextOpen) => setOpenItem(nextOpen ? 'business-decides' : '')}
        >
          <MobileAccordionTrigger title="What businesses still decide" />
          <CollapsibleContent>
            <p className="px-4 pb-4 text-sm leading-6 text-muted-foreground">
              Timing, price, materials, scope, and whether the job is a fit. AE helps the conversation start with better context.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          className="rounded-[var(--ae-radius-sm)] border border-[var(--ae-oxide)]/25 bg-[var(--ae-oxide)]/5"
          open={openItem === 'does-not'}
          onOpenChange={(nextOpen) => setOpenItem(nextOpen ? 'does-not' : '')}
        >
          <MobileAccordionTrigger title="What it does not do" />
          <CollapsibleContent>
            <div className="grid gap-2 px-4 pb-4">
              {doesNotItems.map((label) => (
                <div key={label} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <XIcon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}

function MobileAccordionTrigger({ title }: { title: string }) {
  return (
    <CollapsibleTrigger asChild>
      <button className="group flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left" type="button">
        <span className="font-heading text-base leading-5 font-medium">{title}</span>
        <ChevronDownIcon className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
      </button>
    </CollapsibleTrigger>
  )
}
