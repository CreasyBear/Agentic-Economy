import { Link } from '@tanstack/react-router'

import { AePublicShell, defaultHomeSearch } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'

export function AeNotFound() {
  return (
    <AePublicShell>
      <section className="ae-public-page mx-auto grid w-full max-w-2xl gap-6 px-4 py-20 text-center md:px-6">
        <div className="grid justify-center gap-3">
          <p className="font-heading text-5xl font-semibold tracking-tight md:text-6xl">404</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">This page is not here</h1>
          <p className="mx-auto max-w-md text-pretty leading-7 text-muted-foreground">
            The page you were looking for does not exist, or it may have moved. Try a search, or browse listed services.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link to="/" search={defaultHomeSearch}>Ask a question</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/registry" search={{ q: '', limit: 10 }}>Browse services</Link>
          </Button>
        </div>
      </section>
    </AePublicShell>
  )
}
