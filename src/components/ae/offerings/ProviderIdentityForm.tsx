import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'

import { Button } from '@/components/arc/button/button'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import '@/components/ae/supply/supplier-onboarding-wizard/ProviderIdentityComposition.css'
import { providerIdentityError } from './provider-workspace-projection'
import { ensureProviderBusinessServer } from './provider-identity.functions'

export function ProviderIdentityForm() {
  const router = useRouter()
  const ensureProviderBusiness = useServerFn(ensureProviderBusinessServer)
  const [providerName, setProviderName] = useState('')
  const [providerWebsite, setProviderWebsite] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const [outcomeUnknown, setOutcomeUnknown] = useState(false)

  const submit = async () => {
    const name = providerName.trim()
    let website: URL
    try {
      website = new URL(providerWebsite)
      if (website.protocol !== 'https:') throw new Error('not_https')
    } catch (cause) {
      captureRouteException(cause, { site: 'validateProviderIdentityWebsite' }, 'warning')
      setError('Enter a valid HTTPS provider website.')
      return
    }
    if (name.length === 0) {
      setError('Enter the provider name.')
      return
    }
    setPending(true)
    setError(undefined)
    try {
      const created = await ensureProviderBusiness({ data: { name, slug: name, website: website.origin, providerIdentifier: website.hostname } })
      if (created.kind === 'refused') {
        if (created.code === 'source_unavailable') {
          setOutcomeUnknown(true)
          setError('The provider outcome could not be confirmed. Reload status before submitting again; your details remain here.')
        } else {
          setError(providerIdentityError(created.code))
        }
        return
      }
      await router.invalidate()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setOutcomeUnknown(true)
      setError('The provider outcome could not be confirmed. Reload status before submitting again; your details remain here.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="arc-market arc-provider-identity-form">
      <AeAlert role="alert" tone="info" title="Create your provider identity" className="arc-provider-identity-notice"><div className="arc-provider-identity-notice-description">This starts an unpublished provider workspace. Once an exact Tool passes verification, agents can find it through search and it is listed under your Provider.</div></AeAlert>
      <FieldGroup className="arc-provider-identity-fields">
        <Field className="arc-provider-identity-field" data-invalid={error !== undefined || undefined}>
          <FieldLabel className="arc-provider-identity-label" htmlFor="provider-name">Provider name</FieldLabel>
          <input data-slot="input" className="arc-provider-identity-input" id="provider-name" value={providerName} disabled={pending} onChange={(event) => { setProviderName(event.currentTarget.value); setError(undefined) }} />
          <FieldDescription className="arc-provider-identity-description">The name agents will see after an Tool is verified and published.</FieldDescription>
        </Field>
        <Field className="arc-provider-identity-field" data-invalid={error !== undefined || undefined}>
          <FieldLabel className="arc-provider-identity-label" htmlFor="provider-website">Provider website</FieldLabel>
          <input data-slot="input" className="arc-provider-identity-input arc-provider-identity-mono" id="provider-website" type="url" placeholder="https://api.example.com" value={providerWebsite} disabled={pending} onChange={(event) => { setProviderWebsite(event.currentTarget.value); setError(undefined) }} />
          <FieldDescription className="arc-provider-identity-description">Use the HTTPS origin that controls the provider endpoint.</FieldDescription>
          {error === undefined ? null : <FieldError className="arc-provider-identity-error">{error}</FieldError>}
        </Field>
      </FieldGroup>
      <Button variant="primary" size="md" type="button" className="arc-provider-identity-submit" disabled={pending || outcomeUnknown} aria-busy={pending || undefined} onClick={() => void submit()}>{pending ? 'Creating provider…' : outcomeUnknown ? 'Outcome not confirmed' : 'Create provider workspace'}</Button>
      {outcomeUnknown ? <Button variant="secondary" size="md" type="button" className="arc-provider-identity-reload" disabled={pending} onClick={() => { setPending(true); void router.invalidate().then(() => setOutcomeUnknown(false)).catch((cause) => { captureClientExceptionOnClient(cause); setError('Provider status is still unavailable. No new workspace state is claimed.') }).finally(() => setPending(false)) }}>Reload provider status</Button> : null}
    </div>
  )
}
