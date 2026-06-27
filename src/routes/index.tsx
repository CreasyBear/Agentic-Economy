import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { aeCopy } from '@/lib/ui/copy'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Phase 01 substrate"
        title={aeCopy.shellTitle}
        description={aeCopy.shellDescription}
        actions={
          <>
            <Button type="button">{aeCopy.primaryAction}</Button>
            <Button type="button" variant="outline">
              {aeCopy.secondaryAction}
            </Button>
          </>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-16 md:grid-cols-3 md:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>TanStack Start, React, Clerk, and Convex scaffolding compile together.</CardDescription>
          </CardHeader>
          <CardContent>
            <AeStatusBadge status="guarded" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Guardrails</CardTitle>
            <CardDescription>Import, source-mining, copy, TypeScript, and UI scans run as real tools.</CardDescription>
          </CardHeader>
          <CardContent>
            <AeStatusBadge status="available" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Design substrate</CardTitle>
            <CardDescription>AE tokens, shadcn primitives, and product-owned shell components are wired.</CardDescription>
          </CardHeader>
          <CardContent>
            <AeStatusBadge status="not_live" />
          </CardContent>
        </Card>
      </section>
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 md:px-6">
        <Alert>
          <AlertTitle>Foundation boundary</AlertTitle>
          <AlertDescription>{aeCopy.notLiveNotice}</AlertDescription>
        </Alert>
      </section>
    </AePublicShell>
  )
}
