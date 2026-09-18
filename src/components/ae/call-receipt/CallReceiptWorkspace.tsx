import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Button } from '@/components/ui/button'

export function CallReceiptWorkspace({
  callRef,
  description,
  pending = false,
  children,
}: Readonly<{
  callRef: string
  description: string
  pending?: boolean
  children: ReactNode
}>) {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Call receipt"
      description={description}
      currentPath={`/calls/${encodeURIComponent(callRef)}`}
      breadcrumbs={[{ label: 'Calls', href: '/activity' }, { label: 'Call receipt' }]}
      actions={(
        <Button asChild variant="outline" className="min-h-touch">
          <Link to="/activity">Back to Calls</Link>
        </Button>
      )}
      pending={pending}
    >
      <article id="receipt" className="grid scroll-mt-6 gap-section pb-page">
        {children}
      </article>
    </AeOperatorPage>
  )
}
