import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  EyeOffIcon,
  MessageSquareIcon,
  ReceiptTextIcon,
  SearchIcon,
  StoreIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { name: 'robots', content: 'noindex' },
      { name: 'description', content: 'What Agentic Economy shares when you ask, compare, or contact a business.' },
    ],
  }),
  component: PrivacyRoute,
})

const detailCards = [
  {
    icon: MessageSquareIcon,
    label: 'Contact',
    title: 'Sent to the business',
    body: 'Your name, contact detail, and job note go to the business you chose.',
  },
  {
    icon: ReceiptTextIcon,
    label: 'Receipt',
    title: 'Kept as a record',
    body: 'AE keeps the sent message and delivery state so the handoff has a receipt.',
  },
  {
    icon: EyeOffIcon,
    label: 'Public page',
    title: 'Not shown to visitors',
    body: 'Your contact details do not appear on public service pages.',
  },
] as const

const moments = [
  {
    value: 'contact',
    label: 'Contact',
    icon: MessageSquareIcon,
    title: 'When you contact a business',
    points: ['You pick the business.', 'AE sends your message and contact details to that business.', 'The business replies outside AE or through the owner tools when available.'],
  },
  {
    value: 'ask',
    label: 'Ask',
    icon: SearchIcon,
    title: 'When you ask AE a question',
    points: ['AE uses a browser session marker to keep your answer available.', 'That marker is not your name or contact details.', 'You can clear it by ending your browser session.'],
  },
  {
    value: 'pages',
    label: 'Pages',
    icon: StoreIcon,
    title: 'When you read a business page',
    points: ['Page details come from the business or public information.', 'Source and update cues appear where available.', 'Timing, quote, and availability still come from the business reply.'],
  },
] as const

function PrivacyRoute() {
  const location = useLocation()
  const [selectedMoment, setSelectedMoment] = useState('contact')

  if (location.pathname !== '/privacy') {
    return <Outlet />
  }

  const moment = moments.find((item) => item.value === selectedMoment) ?? moments[0]
  const Icon = moment.icon

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Privacy"
        title="Your details, at a glance."
        description="What is shared when you ask, compare, or contact a business."
      />
      <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {detailCards.map(({ icon: CardIcon, label, title, body }) => (
            <Card key={title} padding={5} className="grid h-full gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Text type="large" weight="semibold" color="primary" className="flex items-center gap-2">
                  <CardIcon className="size-4 text-primary" aria-hidden="true" /> {title}
                </Text>
                <Badge variant="neutral" label={label} />
              </div>
              <Text color="secondary" display="block">{body}</Text>
            </Card>
          ))}
        </section>

        <section className="grid gap-5 border-t pt-8 md:grid-cols-[0.72fr_1.28fr]">
          <div className="grid content-start gap-2">
            <Text type="supporting" weight="medium" color="secondary" display="block">
              Pick a moment
            </Text>
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block">
              What happens where.
            </Text>
          </div>
          <div className="grid gap-3">
            <TabList value={selectedMoment} onChange={setSelectedMoment} layout="fill" aria-label="Privacy moments">
              {moments.map(({ value, label }) => (
                <Tab key={value} value={value} label={label} />
              ))}
            </TabList>
            <Card padding={5} className="grid gap-4">
              <Text type="large" weight="semibold" color="primary" className="flex items-center gap-2">
                <Icon className="size-4 text-primary" aria-hidden="true" /> {moment.title}
              </Text>
              <ul className="grid gap-3 text-sm leading-6 text-secondary">
                {moment.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t pt-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <Text as="h2" type="display-3" weight="semibold" color="primary" display="block">
              Need a page fixed?
            </Text>
            <Text as="p" color="secondary" display="block" className="mt-2">
              Send the page slug and what should change.
            </Text>
          </div>
          <Button label="Open corrections" variant="secondary" href="/privacy/remove-business" endContent={<ArrowRightIcon aria-hidden="true" />} />
        </section>
      </main>
    </AePublicShell>
  )
}
