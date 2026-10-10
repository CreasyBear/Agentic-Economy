import { activityReturnSearch, buyerReturnDestination, type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
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
  const returnDestination = buyerReturnDestination(returnScope)
  return (
    <AeOperatorPage
      operatorRole="owner"
      title={title}
      description={description}
      currentPath={`/calls/${encodeURIComponent(callRef)}`}
      actions={(
        <div className="arc-market arc-call-actions">
          {returnDestination === undefined ? null : <a href={returnDestination.href} className={actionLinkClassName('secondary', 'md')}>{returnDestination.label}</a>}
          <Link
            to="/support"
            search={{ callRef }}
            className={actionLinkClassName('ghost', 'md')}
          >
            Get help
          </Link>
          <Link
            to="/trust"
            className={actionLinkClassName('ghost', 'md')}
          >
            Trust centre
          </Link>
          <Link
            to="/activity"
            search={activityReturnSearch(returnScope)}
            className={actionLinkClassName('ghost', 'md')}
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
