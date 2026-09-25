import type { RefObject } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { SettingsDangerZone, SettingsEmptyState, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import type { OwnerProviderConnection } from '@/modules/capability-supply/supply-funnel.functions'
import { formatRelativeTime, formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { providerConnectionTargetId } from './provider-connection-target'
import {
  providerConnectionHealth,
  providerConnectionResource,
  providerConnectionStatus,
} from './owner-provider-connections-model'
import { OWNER_MCP_OAUTH_CALLBACK_COPY } from './owner-mcp-oauth-callback.contracts'

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
}>) {
  return (
    <>
      {connections.length === 0 ? (
        <SettingsEmptyState
          title="No provider connection yet"
          description="Add the public HTTPS endpoint that returns the x402 payment challenge for your Tool."
          action={readOnly ? undefined : (
            <Button type="button" className="min-h-touch" onClick={onBeginConnection}>
              {missingConnectionActionLabel}
            </Button>
          )}
        />
      ) : (
        <ul className="m-0 min-w-0 list-none p-0">
          {connections.map((connection) => (
            <li
              key={connection.connectionRef}
              id={providerConnectionTargetId(connection.connectionRef)}
              tabIndex={-1}
              className="min-w-0 scroll-mt-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <SettingsRow
                label={providerConnectionStatus(connection)}
                description="Exact method, endpoint, and payment authority."
              >
                <div className="grid min-w-0 gap-2 text-left sm:text-right">
                  <p className="break-all text-muted-foreground">
                    {connection.x402Method ?? 'Method not recorded'} {providerConnectionResource(connection)}
                  </p>
                  {connection.sourceEnvironment === undefined ? null : (
                    <Badge variant="outline" className="justify-self-start sm:justify-self-end">
                      {OWNER_MCP_OAUTH_CALLBACK_COPY.environment[connection.sourceEnvironment]}
                    </Badge>
                  )}
                  <p className="break-all text-muted-foreground">
                    Permission: route x402 payment to {connection.x402Payee ?? 'an unrecorded payee'} for this exact method and resource.
                  </p>
                  <p className="text-muted-foreground">Authority generation {connection.authorityGeneration}</p>
                  {connection.expiresAt === undefined ? (
                    <p className="text-muted-foreground">No scheduled authority expiry</p>
                  ) : (
                    <time dateTime={timestampIso(connection.expiresAt)} className="text-muted-foreground">
                      Authority expires {formatRelativeTime(connection.expiresAt)} · {formatTimestamp(connection.expiresAt)}
                    </time>
                  )}
                  <p className="text-muted-foreground">{providerConnectionHealth(connection)}</p>
                  <p className="text-muted-foreground">Credential rotation: not applicable. x402 stores no provider credential or private key.</p>
                  <p className="text-muted-foreground">Tool readiness is checked per Tool and is not implied by connection health.</p>
                  <AeCopyReference label="connection reference" value={connection.connectionRef} className="justify-start sm:justify-end" />
                  {(connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required') ? (
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-touch"
                        disabled={readOnly || busy !== undefined || refreshRequired}
                        onClick={() => onCheckConnection(connection)}
                      >
                        {busy === connection.connectionRef ? 'Checking…' : 'Check connection'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-touch"
                        disabled={readOnly || busy !== undefined || refreshRequired}
                        onClick={() => onBeginReauthorization(connection)}
                      >
                        Reauthorize
                      </Button>
                    </div>
                  ) : null}
                </div>
              </SettingsRow>
              {rebindOfferingRef !== undefined && connection.connectionRef === rebindConnectionRef ? (
                refreshedForRebind === connection.connectionRef ? (
                  <Alert>
                    <AlertTitle>Authority refreshed</AlertTitle>
                    <AlertDescription className="grid gap-3">
                      Re-admit {rebindOfferingRef} now so this Tool binds to the refreshed authority snapshot.
                      <a
                        ref={rebindLinkRef}
                        href={`/owner/operations/${encodeURIComponent(rebindOfferingRef)}#provider`}
                        className={cn(buttonVariants(), 'min-h-touch justify-self-start')}
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
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-touch shrink-0"
                  disabled={readOnly || busy !== undefined || refreshRequired}
                  onClick={(event) => onRequestRevoke(connection, event.currentTarget)}
                >
                  Revoke
                </Button>
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
    </>
  )
}
