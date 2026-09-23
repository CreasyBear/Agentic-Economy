import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function CallReceiptWorkspace({
  callRef,
  title = 'Call receipt',
  description,
  pending = false,
  children,
}: Readonly<{
  callRef: string
  title?: string
  description: string
  pending?: boolean
  children: ReactNode
}>) {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title={title}
      description={description}
      currentPath={`/calls/${encodeURIComponent(callRef)}`}
      breadcrumbs={[{ label: 'Calls', href: '/activity' }, { label: 'Call receipt' }]}
      actions={(
        <div className="flex flex-wrap gap-intra">
          <Link
            to="/support"
            search={{ callRef }}
            className={cn(buttonVariants({ variant: 'ghost' }), 'min-h-touch')}
          >
            Get help
          </Link>
          <Link
            to="/activity"
            className={cn(buttonVariants({ variant: 'ghost' }), 'min-h-touch')}
          >
            Back to Calls
          </Link>
        </div>
      )}
      pending={pending}
    >
      <article id="receipt" className="grid scroll-mt-6 gap-section pb-page">
        {children}
      </article>
    </AeOperatorPage>
  )
}
