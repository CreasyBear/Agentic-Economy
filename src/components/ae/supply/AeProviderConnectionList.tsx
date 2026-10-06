import type { RefObject } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Button as ArcButton } from '@/components/arc/button/button'
import type { OwnerProviderConnection } from '@/modules/capability-supply/supply-funnel.functions'
import { formatRelativeTime, formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { providerConnectionTargetId } from './provider-connection-target'
import {
  providerConnectionHealth,
  providerConnectionResource,
  providerConnectionStatus,
} from './owner-provider-connections-model'
import { OWNER_MCP_OAUTH_CALLBACK_COPY } from './owner-mcp-oauth-callback.contracts'
import { Integrations, type IntegrationRecord } from '@/components/ae/shared/arc-pro/integrations/integrations'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export function AeProviderConnectionList({
  connections,
  readOnly,
  busy,
  refreshRequired,
  rebindOfferingRef,
  rebindConnectionRef,
  refreshedForRebind,
  rebindLinkRef,
  missingConnectionActionLabel,
  onBeginConnection,
  onCheckConnection,
  onBeginReauthorization,
  onRequestRevoke,
  revokeTarget,
  revokePending,
  revokeTriggerRef,
  onRevokeOpenChange,
  onConfirmRevoke,
  programmaticFocusId,
  onClearProgrammaticFocus,
}: Readonly<{
  connections: readonly OwnerProviderConnection[]
  readOnly: boolean
  busy?: string
  refreshRequired: boolean
  rebindOfferingRef?: string
  rebindConnectionRef?: string
  refreshedForRebind?: string
  rebindLinkRef: RefObject<HTMLAnchorElement | null>
  missingConnectionActionLabel: string
  onBeginConnection: () => void
  onCheckConnection: (connection: OwnerProviderConnection) => void
  onBeginReauthorization: (connection: OwnerProviderConnection) => void
  onRequestRevoke: (connection: OwnerProviderConnection, trigger: HTMLButtonElement) => void
  revokeTarget?: OwnerProviderConnection
  revokePending: boolean
  revokeTriggerRef: RefObject<HTMLButtonElement | null>
  onRevokeOpenChange: (open: boolean) => void
  onConfirmRevoke: () => void
  programmaticFocusId?: string
  onClearProgrammaticFocus: () => void
}>) {
  const actionsDisabled = readOnly || busy !== undefined || refreshRequired
  const records: readonly IntegrationRecord[] = connections.map((connection) => ({
    id: connection.connectionRef,
    targetId: providerConnectionTargetId(connection.connectionRef),
    name: `${connection.x402Method ?? 'Method not recorded'} ${providerConnectionResource(connection)}`,
    description: connection.sourceEnvironment === undefined
      ? 'Exact method, endpoint, and payment authority.'
      : OWNER_MCP_OAUTH_CALLBACK_COPY.environment[connection.sourceEnvironment],
    lifecycleLabel: providerConnectionStatus(connection),
    healthLabel: providerConnectionHealth(connection),
    detail: null,
    facts: [
      { label: 'Permission', value: `Route x402 payment to ${connection.x402Payee ?? 'an unrecorded payee'} for this exact method and resource.` },
      { label: 'Authority generation', value: String(connection.authorityGeneration) },
      { label: 'Authority expiry', value: connection.expiresAt === undefined
        ? 'No scheduled authority expiry'
        : <time dateTime={timestampIso(connection.expiresAt)}>{formatRelativeTime(connection.expiresAt)} · {formatTimestamp(connection.expiresAt)}</time> },
      { label: 'Connection health', value: providerConnectionHealth(connection) },
      { label: 'Credential rotation', value: 'Not applicable. x402 stores no provider credential or private key.' },
      { label: 'Tool readiness', value: 'Tool readiness is checked per Tool and is not implied by connection health.' },
      { label: 'Connection reference', value: <AeCopyReference label="connection reference" value={connection.connectionRef} className="justify-start" /> },
    ],
    ...((connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required') ? {
      actions: <>
        <ArcButton type="button" variant="secondary" size="md" disabled={actionsDisabled}
          aria-busy={busy === connection.connectionRef || undefined} onClick={() => onCheckConnection(connection)}>
          {busy === connection.connectionRef ? 'Checking…' : 'Check connection'}
        </ArcButton>
        <ArcButton type="button" variant="secondary" size="md" disabled={actionsDisabled} onClick={() => onBeginReauthorization(connection)}>
          Reauthorize
        </ArcButton>
        <ArcButton type="button" variant="danger" size="md" disabled={actionsDisabled}
          onClick={(event) => onRequestRevoke(connection, event.currentTarget)}>
          Revoke
        </ArcButton>
        <p>Revoking stops new calls through this connection. Tools using it need a replacement and re-admission.</p>
      </>,
    } : {}),
  }))
  const rebindConnection = connections.find((connection) => connection.connectionRef === rebindConnectionRef)

  return (
    <>
      <Integrations
        records={records}
        title="Connections"
        description="Inspect authority and health for each endpoint. Tool readiness is checked separately."
        {...(programmaticFocusId === undefined ? {} : { forcedVisibleId: programmaticFocusId })}
        onClearProgrammaticFocus={onClearProgrammaticFocus}
        emptyAction={readOnly ? null : (
          <ArcButton type="button" variant="primary" size="md" onClick={onBeginConnection}>
            {missingConnectionActionLabel}
          </ArcButton>
        )}
        context={rebindOfferingRef === undefined || rebindConnection === undefined ? null : (
          refreshedForRebind === rebindConnection.connectionRef ? (
            <Alert>
              <AlertTitle>Authority refreshed</AlertTitle>
              <AlertDescription className="grid gap-3">
                Re-admit {rebindOfferingRef} now so this Tool binds to the refreshed authority snapshot.
                <a ref={rebindLinkRef} href={`/owner/operations/${encodeURIComponent(rebindOfferingRef)}#provider`}
                  className={actionLinkClassName('primary', 'md')}>
                  Re-admit Tool
                </a>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>Two-step authority recovery</AlertTitle>
              <AlertDescription>
                Refresh this connection first. AE will then continue to {rebindOfferingRef} so its binding can be re-admitted against the new authority generation and digest.
              </AlertDescription>
            </Alert>
          )
        )}
      />
      <AeConfirmDialog
        open={revokeTarget !== undefined}
        onOpenChange={onRevokeOpenChange}
        title="Revoke this provider connection?"
        description={revokeTarget === undefined
          ? ''
          : `Revoke access to ${providerConnectionResource(revokeTarget)}. New calls through this connection will stop. Tools that use it need a replacement connection and re-admission before they can accept new calls.`}
        confirmLabel="Revoke provider connection"
        confirmVariant="destructive"
        pending={revokePending}
        onConfirm={onConfirmRevoke}
        returnFocusRef={revokeTriggerRef}
      />
    </>
  )
}
