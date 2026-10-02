import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import buttonStyles from '@/components/arc/button/button.module.css'
import './ReceiptComposition.css'

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
        <div className="arc-market arc-call-actions">
          <Link
            to="/support"
            search={{ callRef }}
            className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.md}`}
          >
            Get help
          </Link>
          <Link
            to="/trust"
            className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.md}`}
          >
            Trust centre
          </Link>
          <Link
            to="/activity"
            className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.md}`}
          >
            Back to Calls
          </Link>
        </div>
      )}
      pending={pending}
    >
      <article id="receipt" className="arc-market arc-call-receipt">
        {children}
      </article>
    </AeOperatorPage>
  )
}
