import { activityReturnHref, activityReturnSearch, type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import buttonStyles from '@/components/arc/button/button.module.css'
import './ReceiptComposition.css'

export function CallReceiptWorkspace({
  callRef,
  returnScope,
  title = 'Call receipt',
  description,
  pending = false,
  children,
}: Readonly<{
  callRef: string
  returnScope?: ActivityReturnScope
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
      breadcrumbs={[{ label: 'Calls', href: activityReturnHref(returnScope) }, { label: 'Call receipt' }]}
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
            search={activityReturnSearch(returnScope)}
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
