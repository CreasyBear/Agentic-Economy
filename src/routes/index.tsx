import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { aeCopy } from '@/lib/ui/copy'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Agentic Economy | Claim a truthful service page' },
      {
        name: 'description',
        content: 'Claim and publish a truthful local-service page without booking, payment, or automated-action claims.',
      },
    ],
  }),
  component: Home,
})

function Home() {
  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Public service catalog"
        title="Claim and publish a truthful service page customers and assistants can read."
        description="Start with emergency local services. Show what is reachable, what is unavailable, and what needs repair without claiming bookings, payments, or automated actions."
        actions={
          <>
            <Button asChild>
              <Link to="/claim">
                <ArrowRightIcon data-icon="inline-start" />
                Claim your service page
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/registry" search={{ q: '', limit: 10 }}>Open registry</Link>
            </Button>
          </>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-16 md:grid-cols-3 md:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Claim without ABN</CardTitle>
            <CardDescription>Submit owner-supplied identity and service facts for a source-owned public page.</CardDescription>
          </CardHeader>
          <CardContent>
            <AeStatusBadge status="claimed" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Publish service facts</CardTitle>
            <CardDescription>Show service area, hours, first-request posture, and unavailable capability states.</CardDescription>
          </CardHeader>
          <CardContent>
            <AeStatusBadge status="published" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Registry search</CardTitle>
            <CardDescription>Search published, non-suppressed catalog facts from the source-owned registry projection.</CardDescription>
          </CardHeader>
          <CardContent>
            <AeStatusBadge status="queued" />
          </CardContent>
        </Card>
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <Alert>
          <AlertTitle>What is not live yet</AlertTitle>
          <AlertDescription>{aeCopy.notLiveNotice}</AlertDescription>
        </Alert>
      </section>
    </AePublicShell>
  )
}
