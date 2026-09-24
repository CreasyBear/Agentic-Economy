import { createFileRoute, Link, useLocation, useRouter } from '@tanstack/react-router'

import { AeOwnerProviderConnections } from '@/components/ae/supply/AeOwnerProviderConnections'
import { providerConnectionTargetId } from '@/components/ae/supply/provider-connection-target'
import { readProviderWorkspaceConnectionsDetailServer } from '@/components/ae/offerings/provider-workspace.functions'
import { SettingsEmptyState, SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { parseOwnerToolsCompatibilitySearch, parseOwnerToolsX402ConnectionSearch } from '@/lib/operator/supply-compatibility'
import { operatorRouteOptions } from '@/lib/operator/route-options'

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
      {targetMissing && <Alert variant="destructive" className="mb-6"><AlertTitle>Connection target unavailable</AlertTitle><AlertDescription>The requested connection is not in the current provider readback. No connection was changed.</AlertDescription></Alert>}
      <AeOwnerProviderConnections businessId={detail.businessId} connections={detail.connections}
        {...(search.connect === 'x402' ? { x402Handoff: search } : {})} />
    </>
  }
  return <SettingsPage title="Provider connections" description="Manage hosted x402 endpoints and their access authority.">
    {detail.kind === 'not_applicable' ? (
      <SettingsEmptyState title="No provider workspace yet" description="Create your provider workspace from Tools, then return here to connect an endpoint."
        action={<Link to="/owner/operations" className={buttonVariants()}>Open Tools</Link>} />
    ) : detail.kind === 'conflict' ? (
      <Alert variant="destructive"><AlertTitle>Connection ownership conflict</AlertTitle><AlertDescription>
        {detail.reason === 'multiple_providers' ? 'More than one provider is linked to this account.' : 'Connection records do not belong to the current provider.'} No connection can be changed until ownership is resolved. <Link to="/support" className="underline">Contact support</Link>.
      </AlertDescription></Alert>
    ) : (
      <Alert><AlertTitle>Connections unavailable</AlertTitle><AlertDescription className="grid gap-3">
        The current provider connection readback could not be confirmed. No connection can be changed until it loads.
        <Button type="button" variant="secondary" className="min-h-touch justify-self-start" onClick={() => void router.invalidate()}>Try again</Button>
      </AlertDescription></Alert>
    )}
  </SettingsPage>
}
