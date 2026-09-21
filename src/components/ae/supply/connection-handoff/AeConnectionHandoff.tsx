import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'

import {
  CONNECTION_HANDOFF_COPY,
  type AeConnectionHandoffProps,
} from './connection-handoff.contracts'
import { projectConnectionHandoffPage } from './connection-handoff.view-model'
import { HandoffStatusPanel } from './components/HandoffStatusPanel'
import { HttpCredentialForm } from './components/HttpCredentialForm'
import { McpOAuthStartPanel } from './components/McpOAuthStartPanel'
import { useConnectionHandoff } from './useConnectionHandoff'

export function AeConnectionHandoff({ loaded }: AeConnectionHandoffProps) {
  const handoff = useConnectionHandoff({ loaded })
  const { surface } = handoff
  const page = projectConnectionHandoffPage(loaded)

  return (
    <AeOperatorPage
      operatorRole="owner"
      title={page.title}
      description={page.description}
      currentPath="/owner/operations/new"
      breadcrumbs={[
        { label: 'My tools', href: '/owner/operations' },
        { label: 'Add Tool', href: '/owner/operations/new' },
        { label: 'Connect Provider' },
      ]}
    >
      <AeSettingsStack>
        {page.environmentLabel === undefined ? null : (
          <Badge variant="outline">{page.environmentLabel}</Badge>
        )}
        {surface.kind === 'unavailable' ? (
          <HandoffStatusPanel
            title={CONNECTION_HANDOFF_COPY.unavailableTitle}
            description={CONNECTION_HANDOFF_COPY.unavailableDescription}
            returnSearch={{}}
          />
        ) : null}
        {surface.kind === 'consumed' ? (
          <HandoffStatusPanel
            title={surface.title}
            description={surface.description}
            returnSearch={surface.returnSearch}
          />
        ) : null}
        {surface.kind === 'expired' ? (
          <HandoffStatusPanel
            title={CONNECTION_HANDOFF_COPY.expiredTitle}
            description={CONNECTION_HANDOFF_COPY.expiredDescription}
            returnSearch={surface.returnSearch}
          />
        ) : null}
        {surface.kind === 'http_pending' ? (
          <HttpCredentialForm
            sourceOriginLabel={surface.sourceOriginLabel}
            credentialLabel={surface.credentialLabel}
            credential={surface.credential}
            busy={surface.busy}
            error={surface.error}
            onCredentialChange={handoff.setCredential}
            onSubmit={handoff.submitHttp}
            onCancel={handoff.handleCancel}
          />
        ) : null}
        {surface.kind === 'mcp_pending' ? (
          <McpOAuthStartPanel
            sourceOriginLabel={surface.sourceOriginLabel}
            beginBusy={surface.beginBusy}
            cancelBusy={surface.cancelBusy}
            error={surface.error}
            onBegin={handoff.beginMcpOAuth}
            onCancel={handoff.handleCancel}
          />
        ) : null}
      </AeSettingsStack>
    </AeOperatorPage>
  )
}
