import { createFileRoute, Link, useLocation, useRouter } from '@tanstack/react-router'

import { AeActionLink } from '@/components/ae/shared/action-link/AeActionLink'
import { AeOwnerProviderConnections } from '@/components/ae/supply/AeOwnerProviderConnections'
import { providerConnectionTargetId } from '@/components/ae/supply/provider-connection-target'
import { readProviderWorkspaceConnectionsDetailServer } from '@/components/ae/offerings/provider-workspace.functions'
import { SettingsEmptyState, SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { parseOwnerToolsCompatibilitySearch, parseOwnerToolsX402ConnectionSearch } from '@/lib/operator/supply-compatibility'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { cn } from '@/lib/utils'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export const Route = createFileRoute('/_operator/owner/settings/integrations')({
  ...operatorRouteOptions,
  validateSearch: (search) => parseOwnerToolsX402ConnectionSearch(search) ?? parseOwnerToolsCompatibilitySearch(search),
  loader: () => readProviderWorkspaceConnectionsDetailServer().catch(() => ({ kind: 'unavailable' as const })),
  head: () => ({ meta: [
    { title: 'Integrations | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: OwnerIntegrationsRoute,
})

function OwnerIntegrationsRoute() {
  const detail = Route.useLoaderData()
  const search = Route.useSearch()
  const { hash } = useLocation()
  const router = useRouter()
  if (detail.kind === 'available') {
    const targetMissing = hash.startsWith('provider-connection-')
      && !detail.connections.some((connection) => providerConnectionTargetId(connection.connectionRef) === hash)
    return <>
      {targetMissing && <AeAlert tone="danger" title="Connection target unavailable" className="mb-6">The requested connection is not in the current provider readback. No connection was changed.</AeAlert>}
      <AeOwnerProviderConnections businessId={detail.businessId} connections={detail.connections}
        {...(search.connect === 'x402' ? { x402Handoff: search } : {})} />
    </>
  }
  return <SettingsPage title="Provider connections" description="Manage hosted x402 endpoints and their access authority.">
    {detail.kind === 'not_applicable' ? (
      <SettingsEmptyState title="No provider workspace yet" description="Create your provider workspace from Tools, then return here to connect an endpoint."
        action={<Link to="/owner/operations" className={cn(actionLinkClassName('primary', 'md'))}>Open Tools</Link>} />
    ) : detail.kind === 'conflict' ? (
      <AeAlert tone="danger" title="Connection ownership conflict">
        {detail.reason === 'multiple_providers' ? 'More than one provider is linked to this account.' : 'Connection records do not belong to the current provider.'} No connection can be changed until ownership is resolved. <Link to="/support" className="underline">Contact support</Link>.
      </AeAlert>
    ) : (
      <AeAlert role="alert" tone="info" title="Connections unavailable"><div className="grid gap-3">
        The current provider connection readback could not be confirmed. No connection can be changed until it loads.
        <AeActionLink type="button" variant="secondary" size="md" labelLayout="wrap" className="min-h-touch justify-self-start" onAction={() => void router.invalidate()}>Try again</AeActionLink>
      </div></AeAlert>
    )}
  </SettingsPage>
}
