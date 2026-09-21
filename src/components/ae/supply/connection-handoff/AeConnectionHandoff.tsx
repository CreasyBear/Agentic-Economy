import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'

import type { AeConnectionHandoffProps } from './connection-handoff.contracts'
import { HandoffStatusPanel } from './components/HandoffStatusPanel'
import { HttpCredentialForm } from './components/HttpCredentialForm'
import { McpOAuthStartPanel } from './components/McpOAuthStartPanel'
import { useConnectionHandoff } from './useConnectionHandoff'

export type { AeConnectionHandoffProps } from './connection-handoff.contracts'

export function AeConnectionHandoff({ loaded }: AeConnectionHandoffProps) {
  const handoff = useConnectionHandoff({ loaded })
  const { surface } = handoff

  return (
    <Shell>
      {surface.kind === 'unavailable' ? (
        <HandoffStatusPanel
          title="This connection request is unavailable"
          description="Return to Add Tool and start the connection again."
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
          title="This connection request has expired"
          description="Return to Add Tool and start the connection again."
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
    </Shell>
  )
}

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Connect Provider"
      description="Connect the credential required by this Provider source."
      currentPath="/owner/operations/new"
      breadcrumbs={[{ label: 'My tools', href: '/owner/operations' }, { label: 'Add Tool', href: '/owner/operations/new' }, { label: 'Connect Provider' }]}
    >
      <AeSettingsStack>{children}</AeSettingsStack>
    </AeOperatorPage>
  )
}
