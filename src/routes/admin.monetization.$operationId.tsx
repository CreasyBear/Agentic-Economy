import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  disableAdminPaidActivationServer,
  markAdminBillingNoRepairServer,
  readAdminBillingServer,
  reconcileAdminBillingOperationServer,
  type AdminBillingMutationServerResult,
} from '@/modules/billing/billing.functions'
import type { AdminBillingOperationProjection, AdminBillingProjection, BillingReconciliation } from '@/modules/billing/public'
import { adminBillingServerToRouteReadback } from '@/routes/admin.monetization'

export const Route = createFileRoute('/admin/monetization/$operationId')({
  loader: ({ params }) => readAdminBillingServer({ data: { operationId: params.operationId } }),
  head: () => ({
    meta: [
      { title: 'Billing operation detail | Agentic Economy' },
      { name: 'description', content: 'Operator detail for one paid activation billing operation.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminMonetizationDetailRoute,
})

function AdminMonetizationDetailRoute() {
  const params = Route.useParams()
  const loaderData = Route.useLoaderData()
  const [readback, setReadback] = useState(() => adminBillingServerToRouteReadback(loaderData))
  const [message, setMessage] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>(readback.deniedReason)
  const reconcile = useServerFn(reconcileAdminBillingOperationServer)
  const markNoRepair = useServerFn(markAdminBillingNoRepairServer)
  const disablePaidActivation = useServerFn(disableAdminPaidActivationServer)
  const operation = readback.projection.operations.find((candidate) => candidate.id === params.operationId)

  async function handleReconcile() {
    setMessage(undefined)
    setError(undefined)
    if (operation === undefined) {
      setError('Operation not found.')
      return
    }

    const result = await reconcile({
      data: {
        businessId: readback.projection.businessId,
        operationId: operation.id,
      },
    })
    handleMutation(result, 'Reconciliation readback recorded.')
  }

  async function handleNoRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(undefined)
    setError(undefined)
    const form = new FormData(event.currentTarget)
    const result = await markNoRepair({
      data: {
        businessId: readback.projection.businessId,
        operationId: params.operationId,
        reason: String(form.get('reason') ?? ''),
        evidenceRefs: splitRefs(String(form.get('evidenceRefs') ?? '')),
      },
    })
    handleMutation(result, 'No-repair state recorded.')
  }

  async function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(undefined)
    setError(undefined)
    const form = new FormData(event.currentTarget)
    const result = await disablePaidActivation({
      data: {
        businessId: readback.projection.businessId,
        reason: String(form.get('reason') ?? ''),
        evidenceRefs: splitRefs(String(form.get('evidenceRefs') ?? '')),
      },
    })
    handleMutation(result, 'Paid activation disabled for this business.')
  }

  function handleMutation(result: AdminBillingMutationServerResult, okMessage: string) {
    if (result.kind === 'error') {
      setError(result.reason)
      return
    }

    setReadback({ projection: result.projection, state: readback.state })
    setMessage(okMessage)
  }

  if (operation === undefined) {
    return (
      <AeOperatorShell
        role="admin"
        title="Billing operation detail"
        description="No source-owned billing operation matched this identifier."
        currentPath="/admin/monetization"
        breadcrumbs={[
          { label: 'Monetization', href: '/admin/monetization' },
          { label: params.operationId },
        ]}
      >
        <Card>
          <CardHeader>
            <CardTitle>Operation not found</CardTitle>
            <CardDescription>{params.operationId}</CardDescription>
          </CardHeader>
        </Card>
      </AeOperatorShell>
    )
  }

  const reconciliations = readback.projection.reconciliations.filter((row) => row.operationId === operation.id)

  return (
    <AeOperatorShell
      role="admin"
      title="Billing operation detail"
      description="Inspect provider refs, receipt refs, reconciliation state, support state, and operator next action without raw secrets."
      currentPath="/admin/monetization"
      breadcrumbs={[
        { label: 'Monetization', href: '/admin/monetization' },
        { label: params.operationId },
      ]}
    >
      <div className="grid gap-6">
        {message === undefined ? null : (
          <Alert>
            <AlertTitle>Billing source updated</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Billing operation needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <OperationCard operation={operation} />
        <ReconciliationCard reconciliations={reconciliations} />
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={handleReconcile}>Reconcile provider state</Button>
          <Button asChild variant="outline">
            <a href="/admin/monetization">Back to monetization</a>
          </Button>
        </div>
        <OperatorControlForms onNoRepair={handleNoRepair} onDisable={handleDisable} />
      </div>
    </AeOperatorShell>
  )
}

function OperationCard({ operation }: { operation: AdminBillingOperationProjection }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{operation.status.replaceAll('_', ' ')}</Badge>
          <Badge variant="outline">{operation.providerRefs.length} provider refs</Badge>
        </div>
        <CardTitle className="break-words text-lg">{operation.id}</CardTitle>
        <CardDescription>{operation.nextAction}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <Fact label="Offer" value={operation.offerId} />
          <Fact label="Evidence refs" value={String(operation.evidenceRefs.length)} />
          <Fact label="Support refs" value={String(operation.supportRecordIds.length)} />
          <Fact label="Retry count" value={String(operation.retryCount)} />
          <Fact label="Created" value={new Date(operation.createdAt).toISOString()} />
          <Fact label="Updated" value={new Date(operation.updatedAt).toISOString()} />
        </dl>
      </CardContent>
    </Card>
  )
}

function ReconciliationCard({ reconciliations }: { reconciliations: readonly BillingReconciliation[] }) {
  if (reconciliations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No reconciliation recorded</CardTitle>
          <CardDescription>Run provider reconciliation after verified provider events are available.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {reconciliations.map((row) => (
        <Card key={row.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{row.status.replaceAll('_', ' ')}</Badge>
              <Badge variant="outline">{row.provider}</Badge>
            </div>
            <CardTitle className="break-words text-lg">{row.id}</CardTitle>
            <CardDescription>{row.operatorNextAction}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm md:grid-cols-3">
              <Fact label="Evidence refs" value={String(row.evidenceRefs.length)} />
              <Fact label="Provider refs" value={String(row.providerRefs.length)} />
              <Fact label="Reason" value={row.reason ?? 'none'} />
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function OperatorControlForms({
  onNoRepair,
  onDisable,
}: {
  onNoRepair: (event: FormEvent<HTMLFormElement>) => void
  onDisable: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Mark no repair</CardTitle>
          <CardDescription>Use only after evidence shows the operation cannot be repaired automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onNoRepair} className="grid gap-3">
            <Input name="reason" placeholder="reason" />
            <Input name="evidenceRefs" placeholder="comma-separated evidence refs" />
            <Button type="submit" variant="outline">Mark no repair</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Disable paid activation</CardTitle>
          <CardDescription>Disables public paid-activation claims for the business.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onDisable} className="grid gap-3">
            <Input name="reason" placeholder="reason" />
            <Input name="evidenceRefs" placeholder="comma-separated evidence refs" />
            <Button type="submit" variant="outline">Disable paid activation</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <dt className="text-xs font-medium uppercase tracking-[var(--ae-public-tracking-mono-label)] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-foreground">{value}</dd>
    </div>
  )
}

function splitRefs(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter((part) => part.length > 0)
}
