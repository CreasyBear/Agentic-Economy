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

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/privacy')({
  staticData: {
    nav: {
      label: 'Privacy',
      footer: { column: 'Legal', order: 0 },
    },
  },
  head: () => buildPublicPageHead({
    path: '/privacy',
    title: 'Privacy | Agentic Economy',
    description: 'What Agentic Economy handles when you browse, call, pay for, or publish Tools and listings.',
  }),
  component: PrivacyRoute,
})

const detailCards = [
  {
    icon: BracesIcon,
    label: 'Call',
    title: 'Inputs go to the selected Provider',
    body: 'Only the inputs required by the exact Tool are released through its published Call path.',
  },
  {
    icon: ReceiptTextIcon,
    label: 'Record',
    title: 'Execution facts support recovery',
    body: 'AE records Call identity, status, usage, settlement, delivery observations, and named evidence needed for recovery.',
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
    title: 'When an agent calls a Tool',
    points: ['The exact Tool defines its inputs, Provider, price, and access requirements.', 'AE checks identity, authority, and available spend before a controlled Call.', 'The Provider receives only the data released for that Tool.'],
  },
  {
    value: 'browse',
    label: 'Browse',
    icon: SearchIcon,
    title: 'When you browse the catalogue',
    points: ['Search and filter choices are used to return matching Tools.', 'Provider pages show published catalogue facts and their freshness.', 'Ratings, latency, popularity, or readiness are shown only when the market has a named source for them.'],
  },
  {
    value: 'money',
    label: 'Money',
    icon: CreditCardIcon,
    title: 'When a metered call may cost money',
    points: ['The exact price and currency are presented before the Call.', 'AE may reserve funds before contacting the Provider.', 'The observed cost is settled, or the reservation is released; uncertain outcomes enter reconciliation.'],
  },
  {
    value: 'publish',
    label: 'Publish',
    icon: StoreIcon,
    title: 'When a Provider publishes',
    points: ['Provider identity, published listings, Tool contracts, prices, readiness, and access facts become catalogue data.', 'Credentials and internal adapter configuration are not part of the public projection.', 'Providers can request a correction or removal through the process below.'],
  },
] as const

function PrivacyRoute() {
  const location = useLocation()

  if (location.pathname !== '/privacy') {
    return <Outlet />
  }

  return (
    <AePublicPage
      kind="document"
      eyebrow="Legal"
      title="Privacy"
      description="What the market handles when you browse, call, pay for, or publish Tools and listings."
    >
      <div className="ae-rail grid max-w-prose gap-page pb-page">
        <section className="grid gap-related">
          {detailCards.map(({ icon: CardIcon, label, title, body }) => (
            <div key={title} className="grid gap-intra">
              <p className="flex items-center gap-intra font-semibold text-foreground">
                <CardIcon className="size-4 text-foreground" aria-hidden="true" /> {title}
                <span className="text-muted-foreground">{label}</span>
              </p>
              <p className="text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-border pt-section">
          <div className="grid gap-related">
            <Tabs defaultValue="call">
              <TabsList aria-label="Privacy moments" className="min-h-touch w-full">
                {moments.map(({ value, label }) => (
                  <TabsTrigger key={value} value={value} className="min-h-touch flex-1">{label}</TabsTrigger>
                ))}
              </TabsList>
              {moments.map(({ value, icon: Icon, title, points }) => (
                <TabsContent key={value} value={value}>
                  <Card className="grid gap-related p-gutter">
                    <p className="flex items-center gap-intra text-lg font-semibold text-foreground">
                      <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
                    </p>
                    <ul className="grid gap-related text-sm leading-6 text-muted-foreground">
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

        <section className="flex flex-col gap-related border-t border-border pt-section md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold text-foreground">
              Need a Provider profile fixed?
            </h2>
            <p className="mt-intra text-muted-foreground">
              Send the Provider slug and what should change.
            </p>
          </div>
          <Button asChild variant="secondary" className="min-h-touch"><Link to="/privacy/remove-business">Open corrections <ArrowRightIcon aria-hidden="true" /></Link></Button>
        </section>
      </div>
    </AePublicPage>
  )
}
