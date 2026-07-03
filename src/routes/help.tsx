import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  CreditCardIcon,
  FileTextIcon,
  MessageSquareIcon,
  PencilIcon,
  ShieldCheckIcon,
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
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'

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
    href: '/registry?q=&limit=10',
    cta: 'Browse services',
  },
  {
    icon: StoreIcon,
    title: 'List or claim',
    body: 'Publish business-supplied service details customers can compare.',
    label: 'Owner',
    href: '/claim',
    cta: 'Start claim',
  },
  {
    icon: PencilIcon,
    title: 'Correct a page',
    body: 'Request a fix, ownership review, or removal.',
    label: 'Fix',
    href: '/privacy/remove-business',
    cta: 'Open corrections',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Privacy',
    body: 'See what is shared when you contact a business.',
    label: 'Details',
    href: '/privacy',
    cta: 'Privacy notes',
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
      <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4 md:grid-cols-2">
          {helpTopics.map(({ icon: Icon, title, body, label, href, cta }) => (
            <Card key={title} padding={5} className="grid h-full gap-4">
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Text type="large" weight="semibold" color="primary" className="flex items-center gap-2">
                    <Icon className="size-4 text-primary" aria-hidden="true" /> {title}
                  </Text>
                  <Badge variant="neutral" label={label} />
                </div>
                <Text color="secondary" display="block">{body}</Text>
              </div>
              <Button label={cta} variant="secondary" size="sm" href={href} endContent={<ArrowRightIcon aria-hidden="true" />} />
            </Card>
          ))}
        </section>

        <section className="grid gap-5 border-t pt-8 md:grid-cols-[0.7fr_1.3fr]">
          <div className="grid content-start gap-2">
            <Text type="supporting" weight="medium" color="secondary" display="block">
              Quick answers
            </Text>
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block">
              Short version first.
            </Text>
          </div>
          <HelpAccordion />
        </section>

        <section className="flex flex-col gap-4 border-t pt-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block">
              Start with the job.
            </Text>
            <Text as="p" color="secondary" display="block" className="mt-2">
              Ask in plain language and compare the businesses that publish a fit.
            </Text>
            <Suggestions wrap className="mt-4" aria-label="Example service questions">
              {helpPrompts.map((prompt) => (
                <Suggestion
                  key={prompt}
                  asChild
                  className="rounded-sm"
                  suggestion={prompt}
                  variant="secondary"
                >
                  <Link to="/" search={{ q: prompt }}>{prompt}</Link>
                </Suggestion>
              ))}
            </Suggestions>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button label="Ask a question" variant="primary" href="/" />
            <Button label="Browse services" variant="secondary" href="/registry?q=&limit=10" />
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
