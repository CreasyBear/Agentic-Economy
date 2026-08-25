import { Link } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function ServicesLoading() {
  return (
    <AePublicShell>
      <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-12 sm:px-6 lg:py-16" aria-busy="true">
        <Card className="grid w-full justify-items-center gap-5 border border-border bg-card p-8 text-center">
          <span className="ae-loading-orb" aria-hidden="true" />
          <p role="status" className="text-muted-foreground">Finding businesses and comparing options…</p>
        </Card>
      </div>
    </AePublicShell>
  )
}

export function ServicesError() {
  return (
    <AePublicShell>
      <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-12 sm:px-6 lg:py-16">
        <Card className="grid gap-3 border border-destructive/50 bg-card p-5" role="alert">
          <div className="grid gap-1">
            <p className="block font-semibold text-foreground">We couldn’t search right now</p>
            <p className="block text-muted-foreground">We couldn’t search for businesses right now. Your request wasn’t the problem, and no business was contacted. Go back to search and try again.</p>
          </div>
          <Button asChild variant="default" className="min-h-11 justify-self-start"><Link to="/">Back to search</Link></Button>
        </Card>
      </div>
    </AePublicShell>
  )
}
