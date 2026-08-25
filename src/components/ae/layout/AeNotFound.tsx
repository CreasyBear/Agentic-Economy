import { SearchIcon, StoreIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export function AeNotFound() {
  return (
    <AePublicShell>
      <section className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-24 md:px-6">
        <div className="flex flex-col gap-4">
          <p className="block text-sm font-medium text-muted-foreground">Route missing</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground md:text-5xl">This page is not here.</h1>
          <p className="block text-lg text-pretty text-muted-foreground">
            The address moved, expired, or was never published. Say what you need and AE will find the
            businesses that can do it.
          </p>
          <div className="flex flex-row flex-wrap gap-3">
            <Button asChild variant="default" className="min-h-11">
              <a href="/">
                <SearchIcon data-icon="inline-start" aria-hidden="true" />
                Ask a question
              </a>
            </Button>
            <Button asChild variant="secondary" className="min-h-11">
              <a href="/for-providers">
                <StoreIcon data-icon="inline-start" aria-hidden="true" />
                List your business
              </a>
            </Button>
          </div>
        </div>
      </section>
    </AePublicShell>
  )
}
