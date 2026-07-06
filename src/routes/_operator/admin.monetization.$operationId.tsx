import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Banner } from '@astryxdesign/core/Banner'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  disableAdminPaidActivationServer,
  markAdminBillingNoRepairServer,
  readAdminBillingServer,
  reconcileAdminBillingOperationServer,
  type AdminBillingMutationServerResult,
} from '@/modules/billing/billing.functions'
import type { AdminBillingOperationProjection, AdminBillingProjection, BillingReconciliation } from '@/modules/billing/public'
import { adminBillingServerToRouteReadback } from '@/routes/_operator/admin.monetization'

export const Route = createFileRoute('/_operator/admin/monetization/$operationId')({
  ...operatorRouteOptions,
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
  const detailPath = `/admin/monetization/${params.operationId}`

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
        operatorRole="admin"
        title="Billing operation detail"
        description="No source-owned billing operation matched this identifier."
        currentPath={detailPath}
      >
        <Card padding={5}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block">Operation not found</Text>
            <Text as="div" type="supporting" color="secondary" display="block">{params.operationId}</Text>
          </div>
        </Card>
      </AeOperatorShell>
    )
  }

  const reconciliations = readback.projection.reconciliations.filter((row) => row.operationId === operation.id)

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Billing operation detail"
      description="Inspect provider refs, receipt refs, reconciliation state, support state, and operator next action without raw secrets."
      currentPath={detailPath}
    >
      <div className="grid gap-6">
        {message === undefined ? null : (
          <Banner status="success" title="Billing source updated" description={message} />
        )}
        {error === undefined ? null : (
          <Banner status="error" title="Billing operation needs attention" description={error} />
        )}
        <OperationCard operation={operation} />
        <ReconciliationCard reconciliations={reconciliations} />
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={handleReconcile} aria-describedby="billing-reconcile-scope" label="Reconcile provider state" />
          <Button href="/admin/monetization" variant="secondary" label="Back to monetization" />
        </div>
        <p id="billing-reconcile-scope" className="text-sm leading-6 text-secondary">
          Reconciliation records provider readback for this operation only. It does not start a plan or disable paid activation.
        </p>
        <OperatorControlForms onNoRepair={handleNoRepair} onDisable={handleDisable} />
      </div>
    </AeOperatorShell>
  )
}

function OperationCard({ operation }: { operation: AdminBillingOperationProjection }) {
  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral" label={operation.status.replaceAll('_', ' ')} />
          <Badge variant="neutral" label={`${operation.providerRefs.length} provider refs`} />
        </div>
        <Text as="div" type="large" weight="semibold" color="primary" display="block" className="break-words text-lg">{operation.id}</Text>
        <Text as="div" type="supporting" color="secondary" display="block">{operation.nextAction}</Text>
      </div>
      <div className="grid gap-4">
        <dl className="grid gap-3 text-sm md:grid-cols-3">
          <Fact label="Offer" value={operation.offerId} />
          <Fact label="Evidence refs" value={String(operation.evidenceRefs.length)} />
          <Fact label="Support refs" value={String(operation.supportRecordIds.length)} />
          <Fact label="Retry count" value={String(operation.retryCount)} />
          <Fact label="Created" value={new Date(operation.createdAt).toISOString()} />
          <Fact label="Updated" value={new Date(operation.updatedAt).toISOString()} />
        </dl>
      </div>
    </Card>
  )
}

function ReconciliationCard({ reconciliations }: { reconciliations: readonly BillingReconciliation[] }) {
  if (reconciliations.length === 0) {
    return (
      <Card padding={5}>
        <div className="grid gap-1.5">
          <Text as="div" type="large" weight="semibold" color="primary" display="block">No reconciliation recorded</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Run provider reconciliation after verified provider events are available.</Text>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      {reconciliations.map((row) => (
        <Card padding={5} key={row.id}>
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral" label={row.status.replaceAll('_', ' ')} />
              <Badge variant="neutral" label={row.provider} />
            </div>
            <Text as="div" type="large" weight="semibold" color="primary" display="block" className="break-words text-lg">{row.id}</Text>
            <Text as="div" type="supporting" color="secondary" display="block">{row.operatorNextAction}</Text>
          </div>
          <div className="grid gap-4">
            <dl className="grid gap-3 text-sm md:grid-cols-3">
              <Fact label="Evidence refs" value={String(row.evidenceRefs.length)} />
              <Fact label="Provider refs" value={String(row.providerRefs.length)} />
              <Fact label="Reason" value={row.reason ?? 'none'} />
            </dl>
          </div>
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
      <Card padding={5}>
        <div className="grid gap-1.5">
          <Text as="div" type="large" weight="semibold" color="primary" display="block">Mark no repair</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Use only after evidence shows this operation cannot be repaired automatically.</Text>
        </div>
        <div className="grid gap-4">
          <form onSubmit={onNoRepair} className="grid gap-3" noValidate>
            <OperatorMutationTextField id="noRepairReason" name="reason" label="Reason" description="Explain why this operation cannot be repaired automatically." />
            <OperatorMutationTextField id="noRepairEvidenceRefs" name="evidenceRefs" label="Evidence refs" description="Comma-separated evidence refs that support the no-repair decision." />
            <p className="text-sm leading-6 text-secondary">
              Scope: marks this operation no-repair. Paid activation remains controlled by the business-level disable action.
            </p>
            <Button type="submit" variant="secondary" label="Mark no repair" />
          </form>
        </div>
      </Card>
      <Card padding={5}>
        <div className="grid gap-1.5">
          <Text as="div" type="large" weight="semibold" color="primary" display="block">Disable paid activation</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Stops public paid-activation claims for the business until support repairs the source state.</Text>
        </div>
        <div className="grid gap-4">
          <form onSubmit={onDisable} className="grid gap-3" noValidate>
            <OperatorMutationTextField id="disableReason" name="reason" label="Reason" description="Explain why paid activation must be disabled for the whole business." />
            <OperatorMutationTextField id="disableEvidenceRefs" name="evidenceRefs" label="Evidence refs" description="Comma-separated evidence refs that justify disabling paid activation." />
            <p className="text-sm leading-6 text-secondary">
              Scope: disables paid activation for this business. It does not cancel existing provider-side objects or refund money.
            </p>
            <Button type="submit" variant="destructive" label="Disable paid activation" />
          </form>
        </div>
      </Card>
    </div>
  )
}

function OperatorMutationTextField({
  id,
  name,
  label,
  description,
}: {
  id: string
  name: string
  label: string
  description: string
}) {
  const [value, setValue] = useState('')

  return (
    <TextInput label={label} description={description} htmlName={name} value={value} onChange={setValue} />
  )
}


function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <dt className="text-xs font-medium tracking-wide text-secondary uppercase">{label}</dt>
      <dd className="mt-1 break-words text-primary">{value}</dd>
    </div>
  )
}

function splitRefs(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter((part) => part.length > 0)
}
