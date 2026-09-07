import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { RenameProviderDisplayNameResult } from '@/lib/server/owner-workspace.functions'
import type { PublicOwnerStatusRouteReadbackResult } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

export function AeWorkspaceGeneral({
  result,
  identity,
  onRename,
}: Readonly<{
  result: PublicOwnerStatusRouteReadbackResult<PublicBusinessCatalogApiV2Dto>
  identity?: Readonly<{ businessId: string; name: string; slug: string; publicStatus: 'unpublished' | 'published' | 'suppressed' }>
  onRename?: (input: Readonly<{ businessId: string; name: string; requestKey: string }>) => Promise<RenameProviderDisplayNameResult>
}>) {
  if (result.kind !== 'available' && identity !== undefined) {
    return (
      <AeSection
        title="Provider identity"
        description="The provider identity that owns these Tools. Publication status is read separately."
      >
        <AeFactList facts={[
          ...(onRename === undefined ? [{ label: 'Name', value: identity.name }] : []),
          { label: 'Public path', value: `/${identity.slug}`, mono: true },
          { label: 'Visibility', value: identity.publicStatus },
        ]} />
        {onRename === undefined ? null : (
          <ProviderNameEditor businessId={identity.businessId} currentName={identity.name} onRename={onRename} />
        )}
      </AeSection>
    )
  }
  if (result.kind === 'not_found') {
    return (
      <AeEmptyState
        title="No provider identity yet"
        description="A public provider listing is required before this workspace can show its catalog identity."
        role="status"
        action={
          <Button asChild className="min-h-touch">
            <Link to="/for-providers">Review provider setup</Link>
          </Button>
        }
      />
    )
  }

  if (result.kind === 'unavailable') {
    return (
      <AeEmptyState
        title="Provider identity is unavailable"
        description="Try again in a moment. If this keeps happening, open Help."
        role="alert"
        action={
          <Button asChild variant="secondary" className="min-h-touch">
            <Link to="/owner/offerings" hash="provider-identity">Try again</Link>
          </Button>
        }
      />
    )
  }

  const { catalog } = result.readback
  const location = catalog.businessContext.kind === 'local_human'
    ? `${catalog.category} in ${catalog.businessContext.suburb}, ${catalog.businessContext.stateTerritory}`
    : `${catalog.category} — ${catalog.businessContext.website}`

  return (
    <>
      <AeSection
        title="Provider identity"
        description="The public provider this workspace lists. Canonical principal and account refs are resolved when you sign in; they are not a separate list yet."
      >
        <AeFactList
          facts={[
            ...(onRename === undefined ? [{ label: 'Name', value: catalog.name }] : []),
            { label: 'Public path', value: `/${catalog.slug}`, mono: true },
            { label: 'Category', value: location },
            { label: 'Disposition', value: catalog.disposition },
            { label: 'Trust', value: catalog.trustTier },
          ]}
        />
        {onRename === undefined ? null : (
          <ProviderNameEditor businessId={catalog.businessId} currentName={catalog.name} onRename={onRename} />
        )}
      </AeSection>
    </>
  )
}

function ProviderNameEditor({
  businessId,
  currentName,
  onRename,
}: Readonly<{
  businessId: string
  currentName: string
  onRename: (input: Readonly<{ businessId: string; name: string; requestKey: string }>) => Promise<RenameProviderDisplayNameResult>
}>) {
  const [name, setName] = useState(currentName)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<RenameProviderDisplayNameResult>()
  const requestKeyRef = useRef<string | null>(null)
  const [previousCurrentName, setPreviousCurrentName] = useState(currentName)
  if (currentName !== previousCurrentName) {
    setPreviousCurrentName(currentName)
    setName(currentName)
  }
  const normalized = normalizeDisplayName(name)
  const invalid = normalized.length === 0 || normalized.length > 160
  const unchanged = normalized === currentName

  return (
    <div className="mt-section grid max-w-xl gap-related">
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor="provider-public-name">Public provider name</FieldLabel>
        <Input
          id="provider-public-name"
          value={name}
          maxLength={200}
          disabled={pending}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.currentTarget.value)
            setFeedback(undefined)
            requestKeyRef.current = crypto.randomUUID()
          }}
        />
        <FieldDescription>
          This name appears on the provider listing and every current Tool. Its public path and provider connection stay unchanged.
        </FieldDescription>
        {invalid ? <FieldError>Enter a public provider name from 1 to 160 characters.</FieldError> : null}
      </Field>
      <Button
        type="button"
        className="min-h-touch justify-self-start"
        disabled={pending || invalid || unchanged}
        aria-busy={pending || undefined}
        onClick={() => {
          setPending(true)
          setFeedback(undefined)
          void onRename({ businessId, name, requestKey: requestKeyRef.current ?? crypto.randomUUID() })
            .then((result) => {
              setFeedback(result)
              if (result.kind === 'updated') {
                setName(result.name)
                requestKeyRef.current = crypto.randomUUID()
              }
            })
            .catch((cause) => {
              captureClientExceptionOnClient(cause)
              setFeedback({ kind: 'refused', code: 'source_unavailable' })
            })
            .finally(() => setPending(false))
        }}
      >
        {pending ? 'Saving public name…' : 'Save public name'}
      </Button>
      {feedback?.kind === 'updated' || feedback?.kind === 'unchanged' ? (
        <Alert role="status">
          <AlertTitle>Public name saved</AlertTitle>
          <AlertDescription>The provider listing and current Tools now use {feedback.name}.</AlertDescription>
        </Alert>
      ) : feedback?.kind === 'refused' ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Public name was not saved</AlertTitle>
          <AlertDescription>{renameFailureMessage(feedback.code)}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

function normalizeDisplayName(value: string): string {
  return value.trim().normalize('NFKC').replace(/\s+/g, ' ')
}

function renameFailureMessage(code: Extract<RenameProviderDisplayNameResult, { kind: 'refused' }>['code']): string {
  if (code === 'invalid_name') return 'Enter a public provider name from 1 to 160 characters.'
  if (code === 'unauthenticated') return 'Sign in again before changing the public provider name.'
  if (code === 'wrong_owner') return 'This account does not own that provider identity.'
  return 'Try again. The existing public name is unchanged.'
}
