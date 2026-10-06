import { Link } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/shared/arc/empty-state/AeEmptyState'
import { ProviderNameEditor } from '@/components/ae/settings/ProviderNameEditor'
import { SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
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
      <SettingsGroup
        title="Provider identity"
        description="The Provider identity that owns these Tools. Publication status is read separately."
      >
        {onRename === undefined ? (
          <SettingsRow label="Name"><span className="block max-w-prose break-words">{identity.name}</span></SettingsRow>
        ) : (
          <SettingsRow label="Public Provider name">
            <ProviderNameEditor businessId={identity.businessId} currentName={identity.name} onRename={onRename} description="This name appears on the Provider listing and every current Tool. Its public path and Provider connection stay unchanged." />
          </SettingsRow>
        )}
        <SettingsRow label="Public path"><code className="break-all font-mono">/{identity.slug}</code></SettingsRow>
        <SettingsRow label="Visibility">{identity.publicStatus}</SettingsRow>
      </SettingsGroup>
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
    : `${catalog.category}, ${catalog.businessContext.website}`

  return (
    <SettingsGroup
      title="Provider identity"
      description="The public Provider this Workspace lists. Canonical principal and account refs are resolved when you sign in; they are not a separate list yet."
    >
      {onRename === undefined ? (
        <SettingsRow label="Name"><span className="block max-w-prose break-words">{catalog.name}</span></SettingsRow>
      ) : (
        <SettingsRow label="Public Provider name">
          <ProviderNameEditor businessId={catalog.businessId} currentName={catalog.name} onRename={onRename} description="This name appears on the Provider listing and every current Tool. Its public path and Provider connection stay unchanged." />
        </SettingsRow>
      )}
      <SettingsRow label="Public path"><code className="break-all font-mono">/{catalog.slug}</code></SettingsRow>
      <SettingsRow label="Category"><span className="block max-w-prose break-words">{location}</span></SettingsRow>
      <SettingsRow label="Disposition">{catalog.disposition}</SettingsRow>
      <SettingsRow label="Trust">{catalog.trustTier}</SettingsRow>
    </SettingsGroup>
  )
}
