import { Link } from '@tanstack/react-router'

import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import type { PublicOwnerStatusRouteReadbackResult } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'

export function AeWorkspaceGeneral({
  result,
}: Readonly<{
  result: PublicOwnerStatusRouteReadbackResult<PublicBusinessCatalogApiV2Dto>
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
        description="Try again in a moment. If this keeps happening, use Help & corrections."
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
            { label: 'Name', value: catalog.name },
            { label: 'Public path', value: `/${catalog.slug}`, mono: true },
            { label: 'Supplier record', value: catalog.businessId, mono: true },
            { label: 'Category', value: location },
            { label: 'Disposition', value: catalog.disposition },
            { label: 'Trust', value: catalog.trustTier },
          ]}
        />
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
