import type { RefObject } from 'react'
import { PlugZap } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { SettingsDangerZone, SettingsEmptyState } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Button as ArcButton } from '@/components/arc/button/button'
import arcButtonStyles from '@/components/arc/button/button.module.css'
import type { OwnerProviderConnection } from '@/modules/capability-supply/supply-funnel.functions'
import { formatRelativeTime, formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { providerConnectionTargetId } from './provider-connection-target'
import {
  providerConnectionHealth,
  providerConnectionResource,
  providerConnectionStatus,
} from './owner-provider-connections-model'
import { OWNER_MCP_OAUTH_CALLBACK_COPY } from './owner-mcp-oauth-callback.contracts'
import './ProviderConnectionsComposition.css'

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
  return (
    <div className="arc-market arc-provider-connections">
      {connections.length === 0 ? (
        <SettingsEmptyState
          title="No provider connection yet"
          description="Add the public HTTPS endpoint that returns the x402 payment challenge for your Tool."
          action={readOnly ? undefined : (
            <ArcButton type="button" variant="primary" size="md" className="arc-provider-connection-action" onClick={onBeginConnection}>
              {missingConnectionActionLabel}
            </ArcButton>
          )}
        />
      ) : (
        <ul className="arc-provider-connection-list" aria-label="Provider connections">
          {connections.map((connection) => (
            <li
              key={connection.connectionRef}
              id={providerConnectionTargetId(connection.connectionRef)}
              tabIndex={-1}
              data-programmatic-focus={programmaticFocusId === providerConnectionTargetId(connection.connectionRef) ? '' : undefined}
              onPointerDown={onClearProgrammaticFocus}
              className="min-w-0 scroll-mt-6 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[programmatic-focus]:focus:outline-2 data-[programmatic-focus]:focus:outline-offset-2 data-[programmatic-focus]:focus:outline-ring arc-provider-connection-row"
            >
              <section className="arc-provider-connection-card">
                <header className="arc-provider-connection-header">
                  <PlugZap size={20} aria-hidden="true" />
                  <div className="arc-provider-connection-heading">
                    <h3>{providerConnectionStatus(connection)}</h3>
                    <p>Exact method, endpoint, and payment authority.</p>
                  </div>
                </header>
                <div className="arc-provider-connection-details">
                  <div className="arc-provider-connection-endpoint">
                    <p>{connection.x402Method ?? 'Method not recorded'} {providerConnectionResource(connection)}</p>
                    {connection.sourceEnvironment === undefined ? null : (
                      <span className="arc-provider-connection-environment">
                        {OWNER_MCP_OAUTH_CALLBACK_COPY.environment[connection.sourceEnvironment]}
                      </span>
                    )}
                  </div>
                  <ul className="access-list" aria-label="Authority, health, and readiness facts">
                    <li>
                      <p>Permission: route x402 payment to {connection.x402Payee ?? 'an unrecorded payee'} for this exact method and resource.</p>
                    </li>
                    <li>
                      <p>Authority generation {connection.authorityGeneration}</p>
                    </li>
                    {connection.expiresAt === undefined ? (
                      <li><p>No scheduled authority expiry</p></li>
                    ) : (
                      <li>
                        <time dateTime={timestampIso(connection.expiresAt)}>
                          Authority expires {formatRelativeTime(connection.expiresAt)} · {formatTimestamp(connection.expiresAt)}
                        </time>
                      </li>
                    )}
                    <li><p>{providerConnectionHealth(connection)}</p></li>
                    <li><p>Credential rotation: not applicable. x402 stores no provider credential or private key.</p></li>
                    <li><p>Tool readiness is checked per Tool and is not implied by connection health.</p></li>
                    <li>
                      <AeCopyReference label="connection reference" value={connection.connectionRef} className="justify-start" />
                    </li>
                  </ul>
                  {(connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required') ? (
                    <div className="arc-provider-connection-actions">
                      <ArcButton
                        type="button"
                        variant="secondary"
                        size="md"
                        className="arc-provider-connection-action"
                        disabled={readOnly || busy !== undefined || refreshRequired}
                        aria-busy={busy === connection.connectionRef || undefined}
                        onClick={() => onCheckConnection(connection)}
                      >
                        {busy === connection.connectionRef ? 'Checking…' : 'Check connection'}
                      </ArcButton>
                      <ArcButton
                        type="button"
                        variant="secondary"
                        size="md"
                        className="arc-provider-connection-action"
                        disabled={readOnly || busy !== undefined || refreshRequired}
                        onClick={() => onBeginReauthorization(connection)}
                      >
                        Reauthorize
                      </ArcButton>
                    </div>
                  ) : null}
                </div>
              </section>
              {rebindOfferingRef !== undefined && connection.connectionRef === rebindConnectionRef ? (
                refreshedForRebind === connection.connectionRef ? (
                  <Alert>
                    <AlertTitle>Authority refreshed</AlertTitle>
                    <AlertDescription className="grid gap-3">
                      Re-admit {rebindOfferingRef} now so this Tool binds to the refreshed authority snapshot.
                      <a
                        ref={rebindLinkRef}
                        href={`/owner/operations/${encodeURIComponent(rebindOfferingRef)}#provider`}
                        className={[arcButtonStyles.button, arcButtonStyles.primary, arcButtonStyles.md, 'arc-provider-connection-action'].join(' ')}
                      >
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
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {connections.some((connection) => connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required') ? (
        <SettingsDangerZone description="Revoking stops new calls through this connection. Tools using it need a replacement and re-admission.">
          <div className="grid gap-2">
            {connections.filter((connection) => connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required').map((connection) => (
              <div key={connection.connectionRef} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0">
                <span className="min-w-0 break-all text-sm">{providerConnectionResource(connection)}</span>
                <ArcButton
                  type="button"
                  variant="danger"
                  size="md"
                  className="arc-provider-connection-action shrink-0"
                  disabled={readOnly || busy !== undefined || refreshRequired}
                  onClick={(event) => onRequestRevoke(connection, event.currentTarget)}
                >
                  Revoke
                </ArcButton>
              </div>
            ))}
          </div>
        </SettingsDangerZone>
      ) : null}
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
    </div>
  )
}
