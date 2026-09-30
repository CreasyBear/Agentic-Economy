import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import { AePageState } from '@/components/ae/layout/AePageState'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { formatExactAmount, parseDecimalExactAmount, PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'
import { canAdminRolePerformAction } from '@/modules/security/public'
import { AgentObjectView } from './components/AgentObjectView'
import { QuoteObjectView } from './components/QuoteObjectView'
import { ToolVersionObjectView } from './components/ToolVersionObjectView'
import { WorkspaceObjectView } from './components/WorkspaceObjectView'
import { AdminObjectPageSkeleton } from './AdminObjectPageSkeleton'
import { ADMIN_OBJECT_PAGE_COPY, formatPerthTimestamp, type AdminObjectPageRef } from './object-pages.contracts'
import { useAdminObjectPage } from './useAdminObjectPage'

export type AdminObjectPageProps = AdminObjectPageRef

export function AdminObjectPage(props: AdminObjectPageProps) {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const [grantAmount, setGrantAmount] = useState('')
  const [grantExpiry, setGrantExpiry] = useState('')
  const [expiryCheckedAt, setExpiryCheckedAt] = useState(() => Date.now())
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantDraft, setGrantDraft] = useState<{
    accountRef: string
    environment: 'sandbox' | 'production'
    amountUnits: string
    expiresAt: number
  } | null>(null)
  const view = useAdminObjectPage(props)
  const parsedAmount = parseDecimalExactAmount('AUD', grantAmount.trim(), 6)
  const amountUnits = parsedAmount !== undefined && BigInt(parsedAmount.units) > 0n
    && BigInt(parsedAmount.units) <= BigInt(PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits)
    ? parsedAmount.units : null
  const expiresAt = grantExpiry.length > 0 ? new Date(grantExpiry).getTime() : Number.NaN
  const validExpiry = Number.isSafeInteger(expiresAt) && expiresAt > expiryCheckedAt
  const canGrant = access?.kind === 'allowed'
    && canAdminRolePerformAction(access.role, ADMIN_ACTION_PERMISSION.grant_promotional_credit)

  if (view === undefined) return <AdminObjectPageSkeleton />
  if (view.kind === 'object_not_found') {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/admin/search"
        recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch}
      />
    )
  }
  if (view.kind === 'refused') {
    return (
      <AePageState
        title={ADMIN_OBJECT_PAGE_COPY.refusedTitle}
        description={ADMIN_OBJECT_PAGE_COPY.refusedDescription}
        tone="danger"
      />
    )
  }
  if (view.kind !== props.kind) {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/admin/search"
        recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch}
      />
    )
  }

  switch (view.kind) {
    case 'quote':
      return <QuoteObjectView view={view} />
    case 'tool_version':
      return <ToolVersionObjectView view={view} />
    case 'workspace':
      return (
        <>
          <WorkspaceObjectView
            view={view}
            grant={canGrant ? {
              amount: grantAmount,
              expiry: grantExpiry,
              canReview: view.paymentEnvironment !== null && view.lifecycle === 'active'
                && amountUnits !== null && validExpiry,
              onAmountChange: setGrantAmount,
              onExpiryChange: (value) => { setGrantExpiry(value); setExpiryCheckedAt(Date.now()) },
              onReview: () => {
                setExpiryCheckedAt(Date.now())
                if (view.paymentEnvironment === null || amountUnits === null || !validExpiry || expiresAt <= Date.now()) return
                setGrantDraft({ accountRef: view.ref, environment: view.paymentEnvironment, amountUnits, expiresAt })
                setGrantOpen(true)
              },
            } : null}
          />
          {canGrant && grantDraft !== null && grantDraft.accountRef === view.ref ? (
            <AdminActionSheet
              action="grant_promotional_credit"
              input={grantDraft}
              targetRefs={[
                { label: 'Workspace', value: view.ref },
                { label: 'Promotional credit', value: `A$${formatExactAmount({ currency: 'AUD', units: grantDraft.amountUnits, exponent: 6 }) ?? grantDraft.amountUnits}` },
                { label: 'Expires', value: formatPerthTimestamp(grantDraft.expiresAt) },
              ]}
              open={grantOpen}
              onOpenChange={setGrantOpen}
            />
          ) : null}
        </>
      )
    case 'agent':
      return <AgentObjectView view={view} />
    default:
      return (
        <OperatorRouteNotFoundRecovery
          recoveryHref="/admin/search"
          recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch}
        />
      )
  }
}
