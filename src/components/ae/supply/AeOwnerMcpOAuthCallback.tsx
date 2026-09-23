import { Link } from '@tanstack/react-router'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export type AeOwnerMcpOAuthCallbackProps = Readonly<{
  result:
    | Readonly<{ kind: 'connected' | 'replayed' }>
    | Readonly<{
        kind: 'refused'
        code:
          | 'authorization_denied'
          | 'not_found'
          | 'attempt_expired'
          | 'not_supported'
          | 'reauthentication_required'
          | 'secret_unavailable'
          | 'connection_conflict'
          | 'source_unavailable'
        continuationDraftRef?: string | undefined
      }>
}>

export function AeOwnerMcpOAuthCallback({ result }: AeOwnerMcpOAuthCallbackProps) {
  const connected = result.kind === 'connected' || result.kind === 'replayed'
  const statusUnavailable = result.kind === 'refused' && result.code === 'source_unavailable'
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Service connection"
      description="Return to Add Tool after the source confirms authentication."
      currentPath="/owner/operations/new"
      breadcrumbs={[
        { label: 'Tools', href: '/owner/operations' },
        { label: 'Add Tool', href: '/owner/operations/new' },
        { label: 'Service connection' },
      ]}
    >
      <AeSettingsStack>
        <Alert variant={connected ? 'default' : 'destructive'}>
          <AlertTitle>{connected ? 'Service connected' : statusUnavailable ? 'Connection status unavailable' : 'Service not connected'}</AlertTitle>
          <AlertDescription>
            <p>{connected
              ? 'AE verified the live MCP source and stored its connection. Return to Add Tool to continue.'
              : 'AE could not confirm the source connection. Return to Add Tool to review the saved source and current connection status before retrying.'}</p>
              <Link
                to="/owner/operations/new"
                search={'continuationDraftRef' in result && result.continuationDraftRef !== undefined
                  ? { draft: result.continuationDraftRef }
                  : {}}
                className={cn(buttonVariants({ variant: 'secondary' }), 'mt-4 min-h-touch')}
              >
                Return to Add Tool
              </Link>
          </AlertDescription>
        </Alert>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
