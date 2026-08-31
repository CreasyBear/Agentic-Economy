import { Link, createFileRoute, Outlet, useLocation, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeOwnerOfferingsList, type OwnerOfferingSummary } from '@/components/ae/offerings/AeOwnerOfferings'
import {
  ensureSupplierBusinessServer,
  readOwnerOfferingSupplyServer,
} from '@/components/ae/offerings/owner-offering.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

export const Route = createFileRoute('/_operator/owner/offerings')({
  ...operatorRouteOptions,
  loader: () => readOwnerOfferingSupplyServer(),
  head: () => ({ meta: [{ title: 'Operations | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: OwnerOfferingsRoute,
})

function OwnerOfferingsRoute() {
  const location = useLocation()
  const router = useRouter()
  const ensureSupplierBusiness = useServerFn(ensureSupplierBusinessServer)
  const [providerName, setProviderName] = useState('')
  const [providerWebsite, setProviderWebsite] = useState('')
  const [identityPending, setIdentityPending] = useState(false)
  const [identityError, setIdentityError] = useState<string>()
  const [identityOutcomeUnknown, setIdentityOutcomeUnknown] = useState(false)
  const result = Route.useLoaderData()
  if (location.pathname !== '/owner/offerings') return <Outlet />

  const offerings: OwnerOfferingSummary[] = result.kind === 'available'
    ? result.offerings.flatMap((item) => item.revision === undefined ? [] : [{ offering: {
        offeringRef: item.revision.offeringRef,
        revision: item.revision.revision,
        name: item.revision.name,
        category: item.revision.category,
        summary: item.revision.summary,
        ...(item.revision.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: item.revision.serviceAreaSummary }),
        ...(item.revision.availabilitySummary === undefined ? {} : { availabilitySummary: item.revision.availabilitySummary }),
        ...(item.revision.pricingSummary === undefined ? {} : { pricingSummary: item.revision.pricingSummary }),
      }, status: item.status, accessPathCount: item.accessPaths.filter((path) => path.status !== 'withdrawn').length }])
    : []

  return (
    <AeOperatorShell operatorRole="owner" title="Operations" description="Publish the exact tools agents can inspect and call." currentPath="/owner/offerings" actions={<Button asChild variant="default"><Link to="/owner/offerings/new">Add Operation</Link></Button>}>
      {result.kind === 'error' ? (
        <Alert variant="destructive"><AlertTitle>Operations did not load</AlertTitle><AlertDescription>{result.reason ?? 'Sign in again or retry this page.'}</AlertDescription></Alert>
      ) : result.kind === 'not_found' ? (
        <div className="grid max-w-xl gap-4">
          <Alert>
            <AlertTitle>Create your supplier identity</AlertTitle>
            <AlertDescription>
              This starts an unpublished supplier workspace. Nothing appears in the market until an exact Operation passes verification.
            </AlertDescription>
          </Alert>
          <FieldGroup>
            <Field {...(identityError === undefined ? {} : { 'data-invalid': true })}>
              <FieldLabel htmlFor="supplier-name">Provider name</FieldLabel>
              <Input
                id="supplier-name"
                value={providerName}
                disabled={identityPending}
                onChange={(event) => {
                  setProviderName(event.currentTarget.value)
                  setIdentityError(undefined)
                }}
              />
              <FieldDescription>The name agents will see after an Operation is verified and published.</FieldDescription>
            </Field>
            <Field {...(identityError === undefined ? {} : { 'data-invalid': true })}>
              <FieldLabel htmlFor="supplier-website">Provider website</FieldLabel>
              <Input
                id="supplier-website"
                type="url"
                placeholder="https://api.example.com"
                value={providerWebsite}
                disabled={identityPending}
                onChange={(event) => {
                  setProviderWebsite(event.currentTarget.value)
                  setIdentityError(undefined)
                }}
              />
              <FieldDescription>Use the HTTPS origin that controls the x402 endpoint.</FieldDescription>
              {identityError === undefined ? null : <FieldError>{identityError}</FieldError>}
            </Field>
          </FieldGroup>
          <Button
            type="button"
            className="min-h-touch justify-self-start"
            disabled={identityPending || identityOutcomeUnknown}
            aria-busy={identityPending || undefined}
            onClick={() => {
              void (async () => {
                const name = providerName.trim()
                let website: URL
                try {
                  website = new URL(providerWebsite)
                  if (website.protocol !== 'https:') throw new Error('not_https')
                } catch {
                  setIdentityError('Enter a valid HTTPS provider website.')
                  return
                }
                if (name.length === 0) {
                  setIdentityError('Enter the provider name.')
                  return
                }
                setIdentityPending(true)
                try {
                  const created = await ensureSupplierBusiness({
                    data: {
                      name,
                      slug: name,
                      website: website.origin,
                      providerIdentifier: website.hostname,
                    },
                  })
                  if (created.kind === 'refused') {
                    if (created.code === 'source_unavailable') {
                      setIdentityOutcomeUnknown(true)
                      setIdentityError('The supplier workspace outcome could not be confirmed. Reload supplier status before submitting again; your details remain on this page.')
                      return
                    }
                    setIdentityError(supplierIdentityError(created.code))
                    return
                  }
                  await router.invalidate()
                } catch (cause) {
                  captureClientExceptionOnClient(cause)
                  setIdentityOutcomeUnknown(true)
                  setIdentityError('The supplier workspace outcome could not be confirmed. Reload supplier status before submitting again; your details remain on this page.')
                } finally {
                  setIdentityPending(false)
                }
              })()
            }}
          >
            {identityPending ? 'Creating supplier…' : identityOutcomeUnknown ? 'Outcome not confirmed' : 'Create supplier workspace'}
          </Button>
          {identityOutcomeUnknown ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-touch justify-self-start"
              disabled={identityPending}
              onClick={() => {
                setIdentityPending(true)
                void router.invalidate()
                  .then(() => setIdentityOutcomeUnknown(false))
                  .catch((cause) => {
                    captureClientExceptionOnClient(cause)
                    setIdentityError('Supplier status is still unavailable. No new workspace state is claimed.')
                  })
                  .finally(() => setIdentityPending(false))
              }}
            >
              Reload supplier status
            </Button>
          ) : null}
        </div>
      ) : result.offerings.some((item) => item.revision === undefined) ? (
        <div className="grid gap-4">
          <Alert><AlertTitle>One Operation needs repair</AlertTitle><AlertDescription>Its current revision could not be read, so it is not shown or editable.</AlertDescription></Alert>
          <AeOwnerOfferingsList offerings={offerings} projectionState={projectionState(result)} />
        </div>
      ) : <AeOwnerOfferingsList offerings={offerings} projectionState={projectionState(result)} />}
    </AeOperatorShell>
  )
}

function supplierIdentityError(code: string): string {
  if (code === 'slug_taken') return 'That provider name is already in use. Choose a more specific name.'
  if (code === 'multiple_businesses') return 'This account has more than one supplier identity. Resolve that conflict before continuing.'
  if (code === 'unauthenticated') return 'Sign in again before creating a supplier workspace.'
  if (code === 'invalid_business') return 'Check the provider name and HTTPS website.'
  return 'The supplier workspace could not be created. Try again.'
}

function projectionState(result: Extract<Awaited<ReturnType<typeof readOwnerOfferingSupplyServer>>, { kind: 'available' }>): 'current' | 'projection_pending' {
  return result.projection.status === 'current' ? 'current' : 'projection_pending'
}
