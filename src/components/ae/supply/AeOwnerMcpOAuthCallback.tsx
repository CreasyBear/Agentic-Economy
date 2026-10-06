import { Link } from '@tanstack/react-router'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Badge } from '@/components/arc/badge/badge'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './connection-handoff/ConnectionHandoffComposition.css'

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
        { label: 'Tools', href: '/owner/operations' },
        { label: 'Add Tool', href: '/owner/operations/new' },
        { label: OWNER_MCP_OAUTH_CALLBACK_COPY.pageTitle },
      ]}
    >
      <AeSettingsStack>
        {result.environment === undefined ? null : (
          <Badge tone="neutral">
            {OWNER_MCP_OAUTH_CALLBACK_COPY.environment[result.environment]}
          </Badge>
        )}
        <AeAlert tone="danger" title={outcome.title} className="arc-market arc-connection-handoff-status">
            <p>{outcome.description}</p>
            <Link
              to="/owner/operations/new"
              search={result.continuationDraftRef === undefined
                ? {}
                : { draft: result.continuationDraftRef }}
              className={`${actionLinkClassName('secondary', 'md')} arc-connection-return`}
            >
              {OWNER_MCP_OAUTH_CALLBACK_COPY.action}
            </Link>
          </AeAlert>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
