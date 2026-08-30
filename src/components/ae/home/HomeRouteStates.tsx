import { Link } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function ServicesLoading() {
  return (
    <AePublicPage>
      <div className="mx-auto grid w-full max-w-4xl gap-related px-gutter py-section sm:px-gutter-lg lg:py-page" aria-busy="true">
        <Card className="grid w-full justify-items-center gap-related border border-border bg-card p-section text-center">
          <span className="ae-loading-orb" aria-hidden="true" />
          <p role="status" className="text-muted-foreground">Finding tools…</p>
        </Card>
      </div>
    </AePublicPage>
  )
}

export function ServicesError() {
  return (
    <AePublicPage>
      <div className="mx-auto grid w-full max-w-4xl gap-related px-gutter py-section sm:px-gutter-lg lg:py-page">
        <Card className="grid gap-related border border-destructive/50 bg-card p-gutter" role="alert">
          <div className="grid gap-intra">
            <p className="block font-semibold text-foreground">The catalog didn’t load</p>
            <p className="block text-muted-foreground">Reload and try again. No tool was called.</p>
          </div>
          <Button asChild variant="default" className="min-h-touch justify-self-start"><Link to="/market" search={{ window: '30d' }}>Browse Operations</Link></Button>
        </Card>
      </div>
    </AePublicPage>
  )
}
