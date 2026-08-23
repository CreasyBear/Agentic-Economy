import { Link, type NotFoundRouteProps } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import type { PublicBusinessPageNotFoundReason } from '@/modules/catalog/public'

export function PublicBusinessNotFound({ data }: NotFoundRouteProps) {
  const reason: PublicBusinessPageNotFoundReason =
    typeof data === 'object' && data !== null && 'reason' in data && data.reason === 'not_public'
      ? 'not_public'
      : 'no_such_business'

  return (
    <AePublicShell>
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        {reason === 'not_public' ? (
          <Empty className="border border-border bg-card p-5">
            <EmptyHeader>
              <h1 className="text-lg font-medium tracking-tight">Supplier profile unavailable</h1>
              <EmptyDescription>This supplier is not published in the catalogue right now.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild variant="default" className="min-h-11"><Link to="/for-providers">Publish an operation</Link></Button>
                <Button asChild variant="secondary" className="min-h-11"><Link to="/market" search={{ window: '30d' }} hash="operations">Back to catalog</Link></Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <Empty className="border border-border bg-card p-5">
            <EmptyHeader>
              <h1 className="text-lg font-medium tracking-tight">No supplier at this address</h1>
              <EmptyDescription>Nothing is published here. Check the address, or browse the catalogue.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild variant="default" className="min-h-11"><Link to="/market" search={{ window: '30d' }} hash="operations">Browse catalog</Link></Button>
                <Button asChild variant="secondary" className="min-h-11"><Link to="/for-providers">Publish an Operation</Link></Button>
              </div>
            </EmptyContent>
          </Empty>
        )}
      </section>
    </AePublicShell>
  )
}
