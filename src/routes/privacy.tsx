import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  EyeOffIcon,
  MessageSquareIcon,
  ReceiptTextIcon,
  SearchIcon,
  StoreIcon,
} from 'lucide-react'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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

  if (location.pathname !== '/privacy') {
    return <Outlet />
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Privacy"
        title="Your details, at a glance."
        description="What is shared when you ask, compare, or contact a business."
      />
      <main className="ae-public-page mx-auto grid w-full max-w-5xl gap-12 px-4 pb-20 md:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {detailCards.map(({ icon: Icon, label, title, body }) => (
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
            </Card>
          ))}
        </section>

        <section className="grid gap-5 border-t border-[var(--ae-public-line)] pt-8 md:grid-cols-[0.72fr_1.28fr]">
          <div className="grid content-start gap-2">
            <p className="font-mono text-xs font-medium tracking-[var(--ae-public-tracking-mono-label)] text-[var(--ae-muted)] uppercase">
              Pick a moment
            </p>
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
              What happens where.
            </h2>
          </div>
          <Tabs defaultValue="contact">
            <TabsList className="grid w-full grid-cols-3 bg-[var(--ae-surface-sunken)]" aria-label="Privacy moments">
              {moments.map(({ value, label }) => (
                <TabsTrigger key={value} value={value}>{label}</TabsTrigger>
              ))}
            </TabsList>
            {moments.map(({ value, icon: Icon, title, points }) => (
              <TabsContent key={value} value={value}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="size-4 text-[var(--ae-amber)]" aria-hidden="true" /> {title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-3 text-sm leading-6 text-muted-foreground">
                      {points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </section>

        <section className="flex flex-col gap-4 border-t border-[var(--ae-public-line)] pt-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight">
              Need a page fixed?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Send the page slug and what should change.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/privacy/remove-business">
              Open corrections
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </section>
      </main>
    </AePublicShell>
  )
}
