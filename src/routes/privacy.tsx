import { Outlet, Link, createFileRoute, useLocation } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  BracesIcon,
  CreditCardIcon,
  EyeOffIcon,
  KeyRoundIcon,
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
      { name: 'description', content: 'What Agentic Economy handles when you browse, call, pay for, or publish Operations.' },
    ],
  }),
  component: PrivacyRoute,
})

const detailCards = [
  {
    icon: BracesIcon,
    label: 'Call',
    title: 'Inputs go to the selected supplier',
    body: 'Only the inputs required by the exact Operation are released through its published call path.',
  },
  {
    icon: ReceiptTextIcon,
    label: 'Record',
    title: 'Execution facts support recovery',
    body: 'AE records invocation identity, status, usage, settlement, and named evidence needed for replay and recovery.',
  },
  {
    icon: EyeOffIcon,
    label: 'Public page',
    title: 'Private call data stays off market pages',
    body: 'Public catalogue and metrics pages do not expose credentials, raw inputs, outputs, or wallet counterparties.',
  },
] as const

const moments = [
  {
    value: 'call',
    label: 'Call',
    icon: KeyRoundIcon,
    title: 'When an agent calls an Operation',
    points: ['The exact Operation defines its inputs, supplier, price, and access requirements.', 'AE checks identity, authority, and available spend before a controlled call.', 'The supplier receives only the data released for that Operation.'],
  },
  {
    value: 'browse',
    label: 'Browse',
    icon: SearchIcon,
    title: 'When you browse the catalogue',
    points: ['Search and filter choices are used to return matching Operations.', 'Supplier pages show published catalogue facts and their freshness.', 'Ratings, latency, popularity, or readiness are shown only when the market has a named source for them.'],
  },
  {
    value: 'money',
    label: 'Money',
    icon: CreditCardIcon,
    title: 'When a metered call may cost money',
    points: ['The exact price and currency are presented before the call.', 'AE may reserve funds before contacting the supplier.', 'The observed cost is settled, or the reservation is released; uncertain outcomes enter reconciliation.'],
  },
  {
    value: 'publish',
    label: 'Publish',
    icon: StoreIcon,
    title: 'When a supplier publishes',
    points: ['Supplier identity, Operation contracts, prices, readiness, and access facts become catalogue data.', 'Credentials and internal adapter configuration are not part of the public projection.', 'Suppliers can request a correction or removal through the process below.'],
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
        description="What the market handles when you browse, call, pay for, or publish Operations."
      />
      <div className="ae-rail grid max-w-prose gap-12 pb-page">
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
            <Tabs defaultValue="call">
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
              Need a supplier profile fixed?
            </h2>
            <p className="mt-2 text-muted-foreground">
              Send the supplier slug and what should change.
            </p>
          </div>
          <Button asChild variant="secondary" className="min-h-11"><Link to="/privacy/remove-business">Open corrections <ArrowRightIcon aria-hidden="true" /></Link></Button>
        </section>
      </div>
    </AePublicShell>
  )
}
