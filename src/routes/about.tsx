import { createFileRoute } from '@tanstack/react-router'
import {
  BotIcon,
  GitCompareIcon,
  SearchIcon,
  SendIcon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'

import { AeAssistantAnswerPreview } from '@/components/ae/landing/AeAssistantAnswerPreview'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

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
    body: 'Some transactions can be simple. Local services still need the business to confirm fit, timing, and price.',
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
      <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-6 md:grid-cols-[1.25fr_1fr] md:items-center">
          <Card padding={5} className="grid gap-4 border-border bg-surface">
            <div className="grid gap-1.5">
              <Text type="supporting" weight="medium" color="secondary" display="block">
                Agent-readable directory
              </Text>
              <Text type="large" weight="semibold" color="primary" display="block">
                Published business facts, one qualified next step.
              </Text>
            </div>
            <div className="grid gap-2">
              <Text color="secondary" display="block">Search a need and place.</Text>
              <Text color="secondary" display="block">Compare what each business publishes.</Text>
              <Text color="secondary" display="block">Send an inquiry only when AE exposes that next step.</Text>
            </div>
          </Card>
          <div className="grid gap-4">
            <Text type="supporting" weight="medium" color="secondary" display="block">
              Agentic commerce
            </Text>
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block" textWrap="balance">
              Commerce is moving from browsing to asking.
            </Text>
            <Text as="p" type="large" color="secondary" display="block" textWrap="pretty">
              People are starting to ask assistants for outcomes instead of browsing a stack of links. Local services need a more careful version: find businesses, understand what they publish, then interact with the business without pretending the job is already done.
            </Text>
            <MobileAccordion
              ariaLabel="Agentic commerce changes"
              className="md:hidden"
              defaultValue="Discovery starts as a question"
              items={commerceShift}
            />
            <div className="hidden gap-3 md:grid">
              {commerceShift.map(({ icon: Icon, title, body }) => (
                <Card key={title} padding={4} className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                    <Text type="large" weight="medium" color="primary">{title}</Text>
                  </div>
                  <Text color="secondary" display="block">{body}</Text>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 border-t pt-8 md:grid-cols-[0.75fr_1.25fr] md:items-start">
          <div className="grid gap-2">
            <Text type="supporting" weight="medium" color="secondary" display="block">
              Answer shape
            </Text>
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block" textWrap="balance">
              AE should feel like asking, not filing.
            </Text>
            <Text color="secondary" display="block">
              The page is for people. The details are structured enough for assistants to read, compare, and route.
            </Text>
          </div>
          <AeAssistantAnswerPreview />
        </section>

        <section className="grid gap-5">
          <div className="grid gap-2 md:max-w-2xl">
            <Text type="supporting" weight="medium" color="secondary" display="block">
              The offer
            </Text>
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block" textWrap="balance">
              Use AE to find businesses and start the right conversation.
            </Text>
          </div>
          <MobileOfferTabs />
          <div className="hidden gap-3 md:grid md:grid-cols-3">
            {offerSteps.map(({ number, title, body }) => (
              <Card key={title} padding={5} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Text type="supporting" color="secondary" display="block">Step {number}</Text>
                  <Text type="large" weight="semibold" color="primary" display="block">{title}</Text>
                </div>
                <Text color="secondary" display="block">{body}</Text>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-7 border-t pt-8">
          <MobileTrustAccordion />
          <div className="hidden gap-6 md:grid md:grid-cols-[0.85fr_1.15fr]">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Text type="supporting" weight="medium" color="secondary" display="block">
                  What it can do
                </Text>
                <Text as="h2" type="display-3" weight="semibold" color="primary" display="block" textWrap="balance">
                  The interaction stays honest.
                </Text>
              </div>
              <div className="grid gap-3">
                {doesItems.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 text-sm">
                    <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4">
              <Card padding={4} variant="muted" className="grid gap-1">
                <Text type="large" weight="medium" color="primary" display="block">What businesses still decide</Text>
                <Text color="secondary" display="block">
                  Timing, price, materials, scope, and whether the job is a fit. AE helps the conversation start with better context.
                </Text>
              </Card>
              <Card padding={4} variant="red" className="grid gap-2">
                <Text type="large" weight="medium" color="primary" display="block">What it does not do</Text>
                <div className="grid gap-2">
                  {doesNotItems.map((label) => (
                    <div key={label} className="flex items-center gap-3 text-sm text-secondary">
                      <XIcon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t pt-7 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <Text as="h2" type="display-3" weight="semibold" color="primary" display="block" textWrap="balance">
                Start with what you need done.
              </Text>
              <Text as="p" type="large" color="secondary" display="block" textWrap="pretty" className="mt-2">
                Ask a question or browse services. AE helps you move from need to business conversation without the usual directory fog.
              </Text>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Button label="Ask a question" variant="primary" href="/" />
              <Button label="Browse services" variant="secondary" href="/registry?q=&limit=10" />
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
    </div>
  )
}

function MobileOfferTabs() {
  const [selectedStep, setSelectedStep] = useState('1')
  const selected = offerSteps.find((step) => step.number === selectedStep) ?? offerSteps[0]!

  return (
    <div className="grid gap-3 md:hidden">
      <TabList value={selectedStep} onChange={setSelectedStep} layout="fill" aria-label="Offer steps">
        {offerSteps.map(({ number }) => (
          <Tab key={number} value={number} label={`Step ${number}`} />
        ))}
      </TabList>
      <Card padding={4}>
        <Text type="supporting" color="secondary" display="block">Step {selected.number}</Text>
        <Text type="display-3" weight="semibold" color="primary" display="block" className="mt-1">{selected.title}</Text>
        <Text color="secondary" display="block" className="mt-3">{selected.body}</Text>
      </Card>
    </div>
  )
}

function MobileTrustAccordion() {
  const [openItem, setOpenItem] = useState('can-do')

  return (
    <div className="grid gap-4 md:hidden">
      <div className="grid gap-2">
        <Text type="supporting" weight="medium" color="secondary" display="block">
          What it can do
        </Text>
        <Text as="h2" type="display-3" weight="semibold" color="primary" display="block" textWrap="balance">
          The interaction stays honest.
        </Text>
      </div>
      <div className="grid gap-2">
        <Collapsible
          className="rounded-sm border bg-card"
          isOpen={openItem === 'can-do'}
          onOpenChange={(nextOpen) => setOpenItem(nextOpen ? 'can-do' : '')}
          trigger={<MobileAccordionTrigger title="What AE can do" />}
        >
          <div className="grid gap-3 px-4 pb-4">
            {doesItems.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Collapsible>

        <Collapsible
          className="rounded-sm border bg-muted/40"
          isOpen={openItem === 'business-decides'}
          onOpenChange={(nextOpen) => setOpenItem(nextOpen ? 'business-decides' : '')}
          trigger={<MobileAccordionTrigger title="What businesses still decide" />}
        >
          <Text as="p" color="secondary" display="block" className="px-4 pb-4">
            Timing, price, materials, scope, and whether the job is a fit. AE helps the conversation start with better context.
          </Text>
        </Collapsible>

        <Collapsible
          className="rounded-sm border border-destructive/25 bg-destructive/5"
          isOpen={openItem === 'does-not'}
          onOpenChange={(nextOpen) => setOpenItem(nextOpen ? 'does-not' : '')}
          trigger={<MobileAccordionTrigger title="What it does not do" />}
        >
          <div className="grid gap-2 px-4 pb-4">
            {doesNotItems.map((label) => (
              <div key={label} className="flex items-center gap-3 text-sm text-secondary">
                <XIcon className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Collapsible>
      </div>
    </div>
  )
}

function MobileAccordionTrigger({ title }: { title: string }) {
  return (
    <span className="flex min-h-12 items-center gap-3 text-left">
      <Text type="large" weight="medium" color="primary">{title}</Text>
    </span>
  )
}
