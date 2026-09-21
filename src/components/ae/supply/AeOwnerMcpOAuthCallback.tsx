import { Link } from '@tanstack/react-router'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import {
  OWNER_MCP_OAUTH_CALLBACK_COPY,
  type AeOwnerMcpOAuthCallbackProps,
} from './owner-mcp-oauth-callback.contracts'

export function AeOwnerMcpOAuthCallback({ result }: AeOwnerMcpOAuthCallbackProps) {
  const outcome = OWNER_MCP_OAUTH_CALLBACK_COPY.outcome[result.code]

  return (
    <AeOperatorPage
      operatorRole="owner"
      title={OWNER_MCP_OAUTH_CALLBACK_COPY.pageTitle}
      description={OWNER_MCP_OAUTH_CALLBACK_COPY.pageDescription}
      currentPath="/owner/operations/new"
      breadcrumbs={[
        { label: 'My tools', href: '/owner/operations' },
        { label: 'Add Tool', href: '/owner/operations/new' },
        { label: OWNER_MCP_OAUTH_CALLBACK_COPY.pageTitle },
      ]}
    >
      <AeSettingsStack>
        {result.environment === undefined ? null : (
          <Badge variant="outline">
            {OWNER_MCP_OAUTH_CALLBACK_COPY.environment[result.environment]}
          </Badge>
        )}
        <Alert variant="destructive">
          <AlertTitle>{outcome.title}</AlertTitle>
          <AlertDescription>
            <p>{outcome.description}</p>
            <Link
              to="/owner/operations/new"
              search={result.continuationDraftRef === undefined
                ? {}
                : { draft: result.continuationDraftRef }}
              className={cn(buttonVariants({ variant: 'secondary' }), 'mt-4 min-h-touch')}
            >
              {OWNER_MCP_OAUTH_CALLBACK_COPY.action}
            </Link>
          </AlertDescription>
        </Alert>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
