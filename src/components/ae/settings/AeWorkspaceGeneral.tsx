import { Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { ProviderNameEditor } from '@/components/ae/settings/ProviderNameEditor'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { RenameProviderDisplayNameResult } from '@/lib/server/owner-workspace.functions'
import buttonStyles from '@/components/arc/button/button.module.css'
import type { PublicOwnerStatusRouteReadbackResult } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

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
        description="The Provider identity that owns these Tools. Publication status is read separately."
      >
        <AeFactList facts={[
          ...(onRename === undefined ? [{ label: 'Name', value: identity.name }] : []),
          { label: 'Public path', value: `/${identity.slug}`, mono: true },
          { label: 'Visibility', value: identity.publicStatus },
        ]} />
        {onRename === undefined ? null : (
          <ProviderNameEditor businessId={identity.businessId} currentName={identity.name} onRename={onRename} description="This name appears on the Provider listing and every current Tool. Its public path and Provider connection stay unchanged." />
        )}
      </AeSection>
    )
  }
  if (result.kind === 'not_found') {
    return (
      <AeEmptyState
        title="No Provider identity yet"
        description="A public Provider listing is required before this Workspace can show its catalog identity."
        role="status"
        action={
          <Link
            to="/for-providers"
            className={`arc-market ${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}
          >
            Review Provider setup
          </Link>
        }
      />
    )
  }

  if (result.kind === 'unavailable') {
    return (
        <Alert variant="destructive" className="arc-market">
        <AlertTitle>Provider identity is unavailable</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>Try again in a moment. If this keeps happening, open Help.</span>
          <Link
            to="/owner/operations"
            hash="provider-identity"
            className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}
          >
            Try again
          </Link>
        </AlertDescription>
      </Alert>
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
        description="The public Provider this Workspace lists. Canonical principal and account refs are resolved when you sign in; they are not a separate list yet."
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
          <ProviderNameEditor businessId={catalog.businessId} currentName={catalog.name} onRename={onRename} description="This name appears on the Provider listing and every current Tool. Its public path and Provider connection stay unchanged." />
        )}
      </AeSection>
    </>
  )
}
