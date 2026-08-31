import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { RenameSupplierDisplayNameResult } from '@/lib/server/owner-workspace.functions'
import type { PublicOwnerStatusRouteReadbackResult } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

export function AeWorkspaceGeneral({
  result,
  onRename,
}: Readonly<{
  result: PublicOwnerStatusRouteReadbackResult<PublicBusinessCatalogApiV2Dto>
  onRename?: (input: Readonly<{ businessId: string; name: string; requestKey: string }>) => Promise<RenameSupplierDisplayNameResult>
}>) {
  if (result.kind === 'not_found') {
    return (
      <AeEmptyState
        title="No supplier identity yet"
        description="A public supplier listing is required before this workspace can show its catalog identity."
        role="status"
        action={
          <Button asChild className="min-h-touch">
            <Link to="/for-providers">Review supplier setup</Link>
          </Button>
        }
      />
    )
  }

  if (result.kind === 'unavailable') {
    return (
      <AeEmptyState
        title="Workspace identity is unavailable"
        description="Try again in a moment. If this keeps happening, open Help."
        role="alert"
        action={
          <Button asChild variant="secondary" className="min-h-touch">
            <Link to="/owner/settings/workspace">Try again</Link>
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
        title="Supplier identity"
        description="The public supplier this workspace lists. Canonical principal and account refs are resolved when you sign in; they are not a separate list yet."
      >
        <AeFactList
          facts={[
            ...(onRename === undefined ? [{ label: 'Name', value: catalog.name }] : []),
            { label: 'Public path', value: `/${catalog.slug}`, mono: true },
            { label: 'Supplier record', value: catalog.businessId, mono: true },
            { label: 'Category', value: location },
            { label: 'Disposition', value: catalog.disposition },
            { label: 'Trust', value: catalog.trustTier },
          ]}
        />
        {onRename === undefined ? null : (
          <SupplierNameEditor businessId={catalog.businessId} currentName={catalog.name} onRename={onRename} />
        )}
      </AeSection>
      <AeSection
        title="Workspace records"
        description="Open the surfaces that maintain this supplier's Operations and listing."
      >
        <div className="grid gap-intra">
          <AeSettingsRow
            title="Supplier listing"
            description="The public page agents find."
            href="/owner/status"
          />
          <AeSettingsRow
            title="Operations"
            description="Operations this workspace lists."
            href="/owner/offerings"
          />
          <AeSettingsRow
            title="Publish"
            description="Connect a source, set price, and keep the route live."
            href="/owner/supply"
          />
          <AeSettingsRow
            title="Setup"
            description="Publication setup for this supplier."
            href="/for-providers"
          />
        </div>
      </AeSection>
    </>
  )
}

function SupplierNameEditor({
  businessId,
  currentName,
  onRename,
}: Readonly<{
  businessId: string
  currentName: string
  onRename: (input: Readonly<{ businessId: string; name: string; requestKey: string }>) => Promise<RenameSupplierDisplayNameResult>
}>) {
  const [name, setName] = useState(currentName)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<RenameSupplierDisplayNameResult>()
  const requestKeyRef = useRef(crypto.randomUUID())
  useEffect(() => setName(currentName), [currentName])
  const normalized = normalizeDisplayName(name)
  const invalid = normalized.length === 0 || normalized.length > 160
  const unchanged = normalized === currentName

  return (
    <div className="mt-section grid max-w-xl gap-related">
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor="supplier-public-name">Public supplier name</FieldLabel>
        <Input
          id="supplier-public-name"
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
          This name appears on the supplier listing and every current Operation. Its public path and provider connection stay unchanged.
        </FieldDescription>
        {invalid ? <FieldError>Enter a public supplier name from 1 to 160 characters.</FieldError> : null}
      </Field>
      <Button
        type="button"
        className="min-h-touch justify-self-start"
        disabled={pending || invalid || unchanged}
        aria-busy={pending || undefined}
        onClick={() => {
          setPending(true)
          setFeedback(undefined)
          void onRename({ businessId, name, requestKey: requestKeyRef.current })
            .then((result) => {
              setFeedback(result)
              if (result.kind === 'updated') {
                setName(result.name)
                requestKeyRef.current = crypto.randomUUID()
              }
            })
            .finally(() => setPending(false))
        }}
      >
        {pending ? 'Saving public name…' : 'Save public name'}
      </Button>
      {feedback?.kind === 'updated' || feedback?.kind === 'unchanged' ? (
        <Alert role="status">
          <AlertTitle>Public name saved</AlertTitle>
          <AlertDescription>The supplier listing and current Operations now use {feedback.name}.</AlertDescription>
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

function renameFailureMessage(code: Extract<RenameSupplierDisplayNameResult, { kind: 'refused' }>['code']): string {
  if (code === 'invalid_name') return 'Enter a public supplier name from 1 to 160 characters.'
  if (code === 'unauthenticated') return 'Sign in again before changing the public supplier name.'
  if (code === 'wrong_owner') return 'This account does not own that supplier identity.'
  return 'Try again. The existing public name is unchanged.'
}
