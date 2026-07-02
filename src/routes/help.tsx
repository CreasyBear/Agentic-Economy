import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  CreditCardIcon,
  FileTextIcon,
  MessageSquareIcon,
  PencilIcon,
  ShieldCheckIcon,
  StoreIcon,
} from 'lucide-react'
import { useState } from 'react'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell, defaultHomeSearch } from '@/components/ae/layout/AePublicShell'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export const Route = createFileRoute('/help')({
  head: () => ({
    meta: [
      { name: 'description', content: 'Find the right next step for contacting, listing, or correcting a business page on Agentic Economy.' },
    ],
  }),
  component: HelpRoute,
})

const helpTopics = [
  {
    icon: MessageSquareIcon,
    title: 'Contact a business',
    body: 'Send the job context a business needs for first contact.',
    label: 'Customer',
    to: '/registry' as const,
    cta: 'Browse services',
    search: { q: '', limit: 10 },
  },
  {
    icon: StoreIcon,
    title: 'List or claim',
    body: 'Publish business-supplied service details customers can compare.',
    label: 'Owner',
    to: '/claim' as const,
    cta: 'Start claim',
    search: undefined,
  },
  {
    icon: PencilIcon,
    title: 'Correct a page',
    body: 'Request a fix, ownership review, or removal.',
    label: 'Fix',
    to: '/privacy/remove-business' as const,
    cta: 'Open corrections',
    search: undefined,
  },
  {
    icon: ShieldCheckIcon,
    title: 'Privacy',
    body: 'See what is shared when you contact a business.',
    label: 'Details',
    to: '/privacy' as const,
    cta: 'Privacy notes',
    search: undefined,
  },
] as const

const quickAnswers = [
  {
    icon: CreditCardIcon,
    title: 'Do I book or pay through AE?',
    body: 'No. AE helps you find, compare, and contact. Timing, price, and availability are confirmed with the business.',
  },
  {
    icon: FileTextIcon,
    title: 'Where do page details come from?',
    body: 'From the business or public information. Pages show source and update cues where available.',
  },
  {
    icon: MessageSquareIcon,
    title: 'What does the business receive?',
    body: 'Your message, contact details, and the service context you choose to share.',
  },
  {
    icon: PencilIcon,
    title: 'Can an owner update a page?',
    body: 'Yes. Claim it, confirm the details, or request a correction.',
  },
] as const

const helpPrompts = [
  'hot water help near Preston',
  'locksmith for a shopfront today',
  'electrician with fast reply cue',
] as const

function HelpRoute() {
  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Help"
        title="What do you need to do?"
        description="Find the right next step for contacting, listing, or correcting a business page."
      />
      <main className="ae-public-page mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4 md:grid-cols-2">
          {helpTopics.map(({ icon: Icon, title, body, label, to, cta, search }) => (
            <Card key={title} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-[var(--ae-amber)]" aria-hidden="true" /> {title}
                  </CardTitle>
                  <Badge variant="outline">{label}</Badge>
                </div>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" size="sm">
                  <Link to={to} {...(search === undefined ? {} : { search })}>
                    {cta}
                    <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-5 border-t border-[var(--ae-public-line)] pt-8 md:grid-cols-[0.7fr_1.3fr]">
          <div className="grid content-start gap-2">
            <p className="font-mono text-xs font-medium tracking-[var(--ae-public-tracking-mono-label)] text-[var(--ae-muted)] uppercase">
              Quick answers
            </p>
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
              Short version first.
            </h2>
          </div>
          <HelpAccordion />
        </section>

        <section className="flex flex-col gap-4 border-t border-[var(--ae-public-line)] pt-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
              Start with the job.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Ask in plain language and compare the businesses that publish a fit.
            </p>
            <Suggestions wrap className="mt-4" aria-label="Example service questions">
              {helpPrompts.map((prompt) => (
                <Suggestion
                  key={prompt}
                  asChild
                  className="rounded-[var(--ae-radius-sm)]"
                  suggestion={prompt}
                  variant="outline"
                >
                  <Link to="/" search={{ q: prompt }}>{prompt}</Link>
                </Suggestion>
              ))}
            </Suggestions>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/" search={defaultHomeSearch}>Ask a question</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/registry" search={{ q: '', limit: 10 }}>Browse services</Link>
            </Button>
          </div>
        </section>
      </main>
    </AePublicShell>
  )
}

function HelpAccordion() {
  const [openItem, setOpenItem] = useState<string>(quickAnswers[0]?.title ?? '')

  return (
    <div className="grid gap-2">
      {quickAnswers.map(({ icon: Icon, title, body }) => {
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
