import { Outlet, Link, createFileRoute, useLocation } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  EyeOffIcon,
  MessageSquareIcon,
  ReceiptTextIcon,
  SearchIcon,
  StoreIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      { title: 'Privacy | Agentic Economy' },
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
    label: 'Copy',
    title: 'Kept for follow-up',
    body: 'AE keeps the sent message and delivery state so you can see what was sent.',
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
    points: ['Page details come from the business or public information.', 'Pages can show where details came from and when they changed.', 'Timing, quote, and availability still come from the business reply.'],
  },
] as const

function PrivacyRoute() {
  const location = useLocation()

  if (location.pathname !== '/privacy') {
    return <Outlet />
  }

  return (
    <AePublicShell>
      <AePageHeader
        title="Privacy"
        description="What is shared when you ask, compare, or contact a business."
      />
      <div className="mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4">
          {detailCards.map(({ icon: CardIcon, label, title, body }) => (
            <div key={title} className="grid gap-1">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <CardIcon className="size-4 text-foreground" aria-hidden="true" /> {title}
                <span className="text-muted-foreground">{label}</span>
              </p>
              <p className="text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-border pt-8">
          <div className="grid gap-3">
            <Tabs defaultValue="contact">
              <TabsList aria-label="Privacy moments" className="min-h-11 w-full">
                {moments.map(({ value, label }) => (
                  <TabsTrigger key={value} value={value} className="min-h-11 flex-1">{label}</TabsTrigger>
                ))}
              </TabsList>
              {moments.map(({ value, icon: Icon, title, points }) => (
                <TabsContent key={value} value={value}>
                  <Card className="grid gap-4 p-5">
                    <p className="flex items-center gap-2 text-lg font-semibold text-foreground">
                      <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
                    </p>
                    <ul className="grid gap-3 text-sm leading-6 text-muted-foreground">
                      {points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold text-foreground">
              Need a page fixed?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Send the page slug and what should change.
            </p>
          </div>
          <Button asChild variant="secondary"><Link to="/privacy/remove-business">Open corrections <ArrowRightIcon aria-hidden="true" /></Link></Button>
        </section>
      </div>
    </AePublicShell>
  )
}
