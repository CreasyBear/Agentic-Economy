import { useState, type FormEvent } from 'react'
import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { toast } from 'sonner'

import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { AeSelectField } from '@/components/ae/forms/AeSelectField'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field, FieldDescription, FieldLabel, getFieldAccessibility } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  publishAdminBillingOfferServer,
  readAdminBillingServer,
  recordAdminBillingEvidenceServer,
  type AdminBillingMutationServerResult,
  type AdminBillingServerResult,
} from '@/modules/billing/billing.functions'
import type { AdminBillingOperationProjection, AdminBillingProjection, BillingSourceState } from '@/modules/billing/public'

type AdminMonetizationSearch = {
  businessId?: string
  operationStatus?: string
}

type AdminMonetizationReadback = {
  deniedReason?: string
  projection: AdminBillingProjection
  state: BillingSourceState
}

export const Route = createFileRoute('/admin/monetization')({
  validateSearch: (search: Record<string, unknown>): AdminMonetizationSearch => {
    const businessId = typeof search.businessId === 'string' && search.businessId.trim().length > 0 ? search.businessId.trim() : undefined
    const operationStatus =
      typeof search.operationStatus === 'string' && search.operationStatus.trim().length > 0
        ? search.operationStatus.trim()
        : undefined
    return {
      ...(businessId === undefined ? {} : { businessId }),
      ...(operationStatus === undefined ? {} : { operationStatus }),
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readAdminBillingServer({ data: deps.businessId === undefined ? {} : { businessId: deps.businessId } }),
  head: () => ({
    meta: [
      { title: 'Billing monetization reconstruction | Agentic Economy' },
      { name: 'description', content: 'Operator reconstruction for paid activation billing evidence.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminMonetizationRoute,
})

export function adminBillingServerToRouteReadback(result: AdminBillingServerResult): AdminMonetizationReadback {
  if (result.kind === 'allowed') {
    return {
      projection: result.projection,
      state: result.state,
    }
  }

  return {
    deniedReason: result.publicMessage,
    projection: result.projection,
    state: result.state,
  }
}

function AdminMonetizationRoute() {
  const location = useLocation()
  const search = Route.useSearch()
  const loaderData = Route.useLoaderData()
  const [readback, setReadback] = useState(() => adminBillingServerToRouteReadback(loaderData))
  const [message, setMessage] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>(readback.deniedReason)
  const publishOffer = useServerFn(publishAdminBillingOfferServer)
  const recordEvidence = useServerFn(recordAdminBillingEvidenceServer)

  if (location.pathname !== '/admin/monetization') {
    return <Outlet />
  }

  async function handlePublishOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(undefined)
    setError(undefined)
    const form = new FormData(event.currentTarget)
    const result = await publishOffer({
      data: {
        businessId: String(form.get('businessId') ?? ''),
        publicName: String(form.get('publicName') ?? ''),
        publicDescription: String(form.get('publicDescription') ?? ''),
        publicCtaLabel: String(form.get('publicCtaLabel') ?? 'Start activation'),
        planId: String(form.get('planId') ?? ''),
        priceSummary: String(form.get('priceSummary') ?? ''),
        termsSummary: String(form.get('termsSummary') ?? ''),
      },
    })
    handleMutation(result, 'Billing offer published from source state.')
  }

  async function handleRecordEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(undefined)
    setError(undefined)
    const form = new FormData(event.currentTarget)
    const result = await recordEvidence({
      data: {
        businessId: String(form.get('businessId') ?? ''),
        provider: 'autumn_cloud',
        connectionStatus: String(form.get('connectionStatus') ?? 'unavailable') === 'ready' ? 'ready' : 'unavailable',
        evidenceSource: 'provider_readback',
        providerObjectId: optionalFormValue(form, 'providerObjectId'),
        routeEvidenceRef: optionalFormValue(form, 'routeEvidenceRef'),
        payloadHash: optionalFormValue(form, 'payloadHash'),
        operatorNextAction: String(form.get('operatorNextAction') ?? ''),
      },
    })
    handleMutation(result, 'Provider evidence support record updated.')
  }

  function handleMutation(result: AdminBillingMutationServerResult, okMessage: string) {
    if (result.kind === 'error') {
      setError(result.reason)
      return
    }

    setReadback({ projection: result.projection, state: readback.state })
    setMessage(okMessage)
    toast.success(okMessage)
  }

  return (
    <AeOperatorShell
      role="admin"
      title="Billing operations"
      description="Review billing operations. Public plans stay off until provider evidence is recorded."
      currentPath="/admin/monetization"
      breadcrumbs={[{ label: 'Monetization', href: '/admin/monetization' }]}
    >
      <Tabs defaultValue="operations">
        <TabsList>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="publish">Publish offer</TabsTrigger>
          <TabsTrigger value="evidence">Record evidence</TabsTrigger>
        </TabsList>
        <TabsContent value="operations">
          <div className="grid gap-6">
            <FilterPanel
              {...(search.businessId === undefined ? {} : { businessId: search.businessId })}
              {...(search.operationStatus === undefined ? {} : { operationStatus: search.operationStatus })}
            />
            {message === undefined ? null : (
              <Alert>
                <AlertTitle>Billing source updated</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            {error === undefined ? null : (
              <Alert variant="destructive">
                <AlertTitle>Billing admin needs attention</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <AdminBillingSummary projection={readback.projection} />
            <AdminBillingOperationRows
              operations={readback.projection.operations}
              {...(search.operationStatus === undefined ? {} : { operationStatus: search.operationStatus })}
            />
          </div>
        </TabsContent>
        <TabsContent value="publish">
          <div className="grid gap-6">
            <PublishOfferPanel onSubmit={handlePublishOffer} {...(search.businessId === undefined ? {} : { businessId: search.businessId })} />
          </div>
        </TabsContent>
        <TabsContent value="evidence">
          <div className="grid gap-6">
            <RecordEvidencePanel onSubmit={handleRecordEvidence} {...(search.businessId === undefined ? {} : { businessId: search.businessId })} />
          </div>
        </TabsContent>
      </Tabs>
    </AeOperatorShell>
  )
}

function FilterPanel({ businessId, operationStatus }: { businessId?: string; operationStatus?: string }) {
  return (
    <AeOperatorFilterCard
      action="/admin/monetization"
      title="Find billing state"
      description="Filter by business identifier and operation status. Filters stay in the URL so you can bookmark a view."
      fields={[
        {
          id: 'businessId',
          name: 'businessId',
          label: 'Business ID',
          description: 'Leave blank to read the latest monetization rows.',
          defaultValue: businessId ?? '',
        },
        {
          id: 'operationStatus',
          name: 'operationStatus',
          label: 'Operation status',
          description: 'Match a source-owned billing operation status.',
          defaultValue: operationStatus ?? '',
        },
      ]}
    />
  )
}

function PublishOfferPanel({ businessId, onSubmit }: { businessId?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Publish sandbox offer</CardTitle>
        <CardDescription>Offer publication does not create a public paid-activation claim by itself.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2" noValidate>
          <AdminBillingTextField
            id="publishBusinessId"
            name="businessId"
            label="Business ID"
            description="Offer state is attached to this business only."
            defaultValue={businessId ?? ''}
          />
          <AdminBillingTextField id="publishPlanId" name="planId" label="Autumn plan ID" description="Provider plan identifier from Autumn Cloud." />
          <AdminBillingTextField id="publishPublicName" name="publicName" label="Offer name" description="Admin label shown in owner billing operations." defaultValue="Paid activation" />
          <AdminBillingTextField id="publishPublicCtaLabel" name="publicCtaLabel" label="CTA label" description="Owner action text for the provider handoff." defaultValue="Start activation" />
          <AdminBillingTextField id="publishPriceSummary" name="priceSummary" label="Price summary" description="Human-readable price evidence, not a payment authority." />
          <AdminBillingTextField id="publishTermsSummary" name="termsSummary" label="Terms summary" description="Terms shown to owners before activation." />
          <AdminBillingTextField id="publishPublicDescription" name="publicDescription" label="Description" description="Describe the paid activation offer without public availability claims." className="md:col-span-2" />
          <p className="md:col-span-2 text-sm leading-6 text-muted-foreground">
            Publishing records sandbox offer state only. Public paid activation still requires provider evidence and an owner activation attempt.
          </p>
          <Button type="submit" className="w-fit">Publish sandbox offer</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function RecordEvidencePanel({ businessId, onSubmit }: { businessId?: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [connectionStatus, setConnectionStatus] = useState('unavailable')
  const connectionStatusField = getFieldAccessibility({ id: 'connectionStatus', hasDescription: true })


  return (
    <Card>
      <CardHeader>
        <CardTitle>Record provider support evidence</CardTitle>
        <CardDescription>Ready evidence must come from provider readback, never env presence alone.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2" noValidate>
          <AdminBillingTextField
            id="evidenceBusinessId"
            name="businessId"
            label="Business ID"
            description="Evidence is recorded against this business only."
            defaultValue={businessId ?? ''}
          />
          <Field {...connectionStatusField.fieldProps}>
            <FieldLabel htmlFor={connectionStatusField.controlProps.id}>Connection status</FieldLabel>
            <AeSelectField
              id={connectionStatusField.controlProps.id}
              name="connectionStatus"
              value={connectionStatus}
              options={[
                { value: 'unavailable', label: 'Unavailable' },
                { value: 'ready', label: 'Ready' },
              ]}
              {...(connectionStatusField.controlProps['aria-describedby'] === undefined ? {} : { describedBy: connectionStatusField.controlProps['aria-describedby'] })}
              onValueChange={setConnectionStatus}
            />
            <FieldDescription {...connectionStatusField.descriptionProps}>Ready must come from provider readback, not env presence alone.</FieldDescription>
          </Field>
          <AdminBillingTextField id="evidenceProviderObjectId" name="providerObjectId" label="Provider object ID" description="Provider-side object or account reference." />
          <AdminBillingTextField id="evidenceRouteEvidenceRef" name="routeEvidenceRef" label="Route evidence ref" description="Internal evidence reference for the route readback." />
          <AdminBillingTextField id="evidencePayloadHash" name="payloadHash" label="Provider payload hash" description="Hash of the provider readback payload." />
          <AdminBillingTextField id="evidenceOperatorNextAction" name="operatorNextAction" label="Operator next action" description="Next local operator step after this evidence record." />
          <p className="md:col-span-2 text-sm leading-6 text-muted-foreground">
            Evidence changes support and operator state. It does not charge, subscribe, or publish a customer-facing paid claim.
          </p>
          <Button type="submit" variant="outline" className="w-fit">Record provider evidence</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AdminBillingTextField({
  id,
  name,
  label,
  description,
  defaultValue,
  className,
}: {
  id: string
  name: string
  label: string
  description: string
  defaultValue?: string
  className?: string
}) {
  const fieldA11y = getFieldAccessibility({ id, hasDescription: true })

  return (
    <Field {...fieldA11y.fieldProps} className={className}>
      <FieldLabel htmlFor={fieldA11y.controlProps.id}>{label}</FieldLabel>
      <Input {...fieldA11y.controlProps} name={name} defaultValue={defaultValue ?? ''} />
      <FieldDescription {...fieldA11y.descriptionProps}>{description}</FieldDescription>
    </Field>
  )
}


function AdminBillingSummary({ projection }: { projection: AdminBillingProjection }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing reconstruction</CardTitle>
        <CardDescription>{projection.businessId}</CardDescription>
      </CardHeader>
      <CardContent>
        <AeOperatorFactGrid
          facts={[
            { label: 'Operations', value: projection.operations.length },
            { label: 'Reconciliations', value: projection.reconciliations.length },
            {
              label: 'Matched',
              value: projection.reconciliations.filter((row) => row.status === 'matched').length,
            },
          ]}
        />
      </CardContent>
    </Card>
  )
}

function AdminBillingOperationRows({
  operations,
  operationStatus,
}: {
  operations: readonly AdminBillingOperationProjection[]
  operationStatus?: string
}) {
  const filtered =
    operationStatus === undefined
      ? operations
      : operations.filter((operation) => operation.status === operationStatus)

  return (
    <AeOperatorQueueList
      scroll
      rows={filtered.map((operation) => ({
        id: operation.id,
        href: `/admin/monetization/${encodeURIComponent(operation.id)}`,
        badges: [
          { label: operation.status.replaceAll('_', ' ') },
          { label: `${operation.providerRefs.length} provider refs`, variant: 'outline' as const },
        ],
        title: operation.id,
        description: operation.nextAction,
        facts: [
          { label: 'Offer', value: operation.offerId },
          { label: 'Evidence refs', value: String(operation.evidenceRefs.length) },
          { label: 'Retry count', value: String(operation.retryCount) },
        ],
        actions: [
          {
            label: 'Open operation',
            href: `/admin/monetization/${encodeURIComponent(operation.id)}`,
            variant: 'outline',
          },
        ],
      }))}
      emptyTitle="No billing operations"
      emptyDescription="Start an owner activation or filter a business with source-owned billing rows."
    />
  )
}

function optionalFormValue(form: FormData, name: string): string | undefined {
  const value = String(form.get(name) ?? '').trim()
  return value.length === 0 ? undefined : value
}
