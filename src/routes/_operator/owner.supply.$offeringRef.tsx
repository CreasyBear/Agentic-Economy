import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { useState } from 'react'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  readOwnerOperationsIdentityDetailServer,
  readOwnerSupplierOperationStatusServer,
} from '@/components/ae/offerings/owner-operations.functions'
import {
  AeSupplierOperationDetail,
  type SupplierOperationActionOutcome,
} from '@/components/ae/supply/AeSupplierOperationDetail'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  recheckOwnerCapabilityServer,
  republishOwnerCapabilityServer,
  withdrawOwnerCapabilityServer,
  type OwnerSupplyCommandResult,
  type OwnerSupplyMaintenanceInput,
  type SupplyFunnelActionContext,
} from '@/modules/capability-supply/supply-funnel.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/supply/$offeringRef')({
  ...operatorRouteOptions,
  loader: async ({ params }) => {
    const identity = await readOwnerOperationsIdentityDetailServer()
    if (identity.kind !== 'available') return { identity, status: { kind: 'not_found' as const } }
    const status = await readOwnerSupplierOperationStatusServer({ data: {
      businessId: identity.businessId,
      offeringRef: params.offeringRef,
    } })
    return { identity, status }
  },
  head: () => ({
    meta: [
      { title: 'Operation status | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSupplyDetailRoute,
})

function OwnerSupplyDetailRoute() {
  const { offeringRef } = Route.useParams()
  const result = Route.useLoaderData()
  const router = useRouter()
  const [operationKeys] = useState(() => new Map<string, string>())
  const recheck = useServerFn(recheckOwnerCapabilityServer)
  const withdraw = useServerFn(withdrawOwnerCapabilityServer)
  const republishRequest = useServerFn(republishOwnerCapabilityServer)
  const republish = useReverification(republishRequest)

  if (result.identity.kind !== 'available' || result.status.kind !== 'available') {
    return <UnavailableOperation offeringRef={offeringRef} unavailable={result.status.kind === 'unavailable'} />
  }
  if (
    result.status.operation.offeringRef !== offeringRef
    || result.status.status.businessRef !== result.identity.businessId
  ) {
    return <UnavailableOperation offeringRef={offeringRef} unavailable={false} />
  }
  const context: SupplyFunnelActionContext | undefined = result.status.maintenance === undefined
    ? undefined
    : { businessId: result.identity.businessId, ...result.status.maintenance }
  const name = result.status.operation.name
  const resumeHref = result.status.resumeCandidateRef === undefined
    ? undefined
    : `/owner/offerings/new?draft=${encodeURIComponent(result.status.resumeCandidateRef)}`

  function maintenanceAction(
    action: 'recheck' | 'withdraw' | 'republish',
    serverFn: (input: { data: OwnerSupplyMaintenanceInput }) => Promise<OwnerSupplyCommandResult>,
  ): (() => Promise<SupplierOperationActionOutcome>) | undefined {
    if (context === undefined) return undefined
    return async () => {
      const actionKey = `${action}:${canonicalDigest(context)}`
      let operationKey = operationKeys.get(actionKey)
      if (operationKey === undefined) {
        operationKey = `owner-supply:${action}:${crypto.randomUUID()}`
        operationKeys.set(actionKey, operationKey)
      }
      const outcome = await serverFn({ data: maintenanceCommand(context, action, operationKey) })
      if (!sourceUnavailable(outcome)) operationKeys.delete(actionKey)
      if (outcome.kind === 'refused') return { kind: 'refused', message: correctionRefusal(outcome.reason) }
      await router.invalidate()
      return { kind: 'applied', message: correctionMessage(outcome) }
    }
  }

  const onRecheck = maintenanceAction('recheck', recheck)
  const onWithdraw = maintenanceAction('withdraw', withdraw)
  const onRepublish = maintenanceAction('republish', republish)
  return (
    <AeOperatorShell
      operatorRole="owner"
      title={name}
      description="Current publication, source health, delivery and Qualified Use."
      currentPath={`/owner/supply/${encodeURIComponent(offeringRef)}`}
      breadcrumbs={[{ label: 'Operations', href: '/owner/offerings' }, { label: name }]}
    >
      <AeSupplierOperationDetail
        name={name}
        status={result.status.status}
        {...(resumeHref === undefined ? {} : { resumeHref })}
        onRefresh={async () => {
          await router.invalidate()
          return { kind: 'applied', message: 'The canonical Operation status is current.' }
        }}
        {...(onRecheck === undefined ? {} : { onRecheck })}
        {...(onWithdraw === undefined ? {} : { onWithdraw })}
        {...(onRepublish === undefined ? {} : { onRepublish })}
      />
    </AeOperatorShell>
  )
}

function UnavailableOperation({ offeringRef, unavailable }: Readonly<{ offeringRef: string; unavailable: boolean }>) {
  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Operation status"
      description="AE could not confirm this Operation."
      currentPath={`/owner/supply/${encodeURIComponent(offeringRef)}`}
    >
      <div className="grid gap-related">
        <Alert variant={unavailable ? 'destructive' : 'default'}>
          <AlertTitle>{unavailable ? 'Operation status unavailable' : 'Operation not found'}</AlertTitle>
          <AlertDescription>
            {unavailable
              ? 'AE could not read the canonical lifecycle. No Operation was changed.'
              : 'This Operation is not part of the current Provider workspace.'}
          </AlertDescription>
        </Alert>
        <Button asChild variant="secondary" className="min-h-touch w-fit">
          <Link to="/owner/offerings">Return to Operations</Link>
        </Button>
      </div>
    </AeOperatorShell>
  )
}

function maintenanceCommand(
  context: SupplyFunnelActionContext,
  action: 'recheck' | 'withdraw' | 'republish',
  operationKey: string,
): OwnerSupplyMaintenanceInput {
  return {
    ...context,
    operationKey,
    correlationId: `owner-supply:${action}:${context.offeringRef}`,
    reasonCode: `owner_supply_${action}`,
    evidenceRefs: ['owner-supply:operation-status'],
  }
}

function correctionMessage(result: Exclude<OwnerSupplyCommandResult, { kind: 'refused' }>): string {
  if (result.kind === 'withdrawn') return 'The Operation is withdrawn and no longer accepts new work.'
  if (result.kind === 'republished') return 'The Operation was submitted for validation before returning to the market.'
  return 'AE scheduled a fresh source and readiness check for this Operation.'
}

function correctionRefusal(reason: string): string {
  if (reason === 'revision_changed' || reason === 'publication_stale') {
    return 'The Operation changed elsewhere. Reload its current status before trying again.'
  }
  if (reason === 'source_unavailable') {
    return 'AE could not confirm the source. Reload this Operation before trying another action.'
  }
  return 'AE refused this change because the current Operation no longer satisfies its required preconditions.'
}

function sourceUnavailable(result: OwnerSupplyCommandResult): boolean {
  return result.kind === 'refused' && result.reason === 'source_unavailable'
}
