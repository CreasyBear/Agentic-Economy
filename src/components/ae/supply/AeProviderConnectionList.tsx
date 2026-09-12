import type { RefObject } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Button } from '@/components/ui/button'
import type { OwnerProviderConnection } from '@/modules/capability-supply/supply-funnel.functions'
import { formatRelativeTime, formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { providerConnectionTargetId } from './provider-connection-target'
import {
  providerConnectionHealth,
  providerConnectionResource,
  providerConnectionStatus,
} from './owner-provider-connections-model'

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
        <AeEmptyState
          title="No provider connection yet"
          description="Add the public HTTPS endpoint that returns the x402 payment challenge for your Tool."
          action={readOnly ? undefined : (
            <Button type="button" className="min-h-touch" onClick={onBeginConnection}>
              {missingConnectionActionLabel}
            </Button>
          )}
        />
      ) : (
        <ul className="m-0 grid list-none divide-y divide-border border-y border-border p-0">
          {connections.map((connection) => (
            <li
              key={connection.connectionRef}
              id={providerConnectionTargetId(connection.connectionRef)}
              tabIndex={-1}
              className="grid min-w-0 scroll-mt-6 gap-3 py-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <p className="font-medium text-foreground">{providerConnectionStatus(connection)}</p>
                  <p className="break-all text-sm text-muted-foreground">
                    {connection.x402Method ?? 'Method not recorded'} {providerConnectionResource(connection)}
                  </p>
                  <p className="break-all text-sm text-muted-foreground">
                    Permission: route x402 payment to {connection.x402Payee ?? 'an unrecorded payee'} for this exact method and resource.
                  </p>
                  <p className="text-sm text-muted-foreground">Authority generation {connection.authorityGeneration}</p>
                  {connection.expiresAt === undefined ? (
                    <p className="text-sm text-muted-foreground">No scheduled authority expiry</p>
                  ) : (
                    <time
                      dateTime={timestampIso(connection.expiresAt)}
                      className="text-sm text-muted-foreground"
                    >
                      Authority expires {formatRelativeTime(connection.expiresAt)} · {formatTimestamp(connection.expiresAt)}
                    </time>
                  )}
                  <p className="text-sm text-muted-foreground">{providerConnectionHealth(connection)}</p>
                  <p className="text-sm text-muted-foreground">Credential rotation: not applicable. x402 stores no provider credential or private key.</p>
                  <p className="text-sm text-muted-foreground">Tool readiness is checked per Tool and is not implied by connection health.</p>
                  <AeCopyReference label="connection reference" value={connection.connectionRef} />
                </div>
                {(connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required') ? (
                  <div className="flex flex-wrap gap-2">
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
                      variant="secondary"
                      className="min-h-touch"
                      disabled={readOnly || busy !== undefined || refreshRequired}
                      onClick={() => onBeginReauthorization(connection)}
                    >
                      Reauthorize
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-touch"
                      disabled={readOnly || busy !== undefined || refreshRequired}
                      onClick={(event) => onRequestRevoke(connection, event.currentTarget)}
                    >
                      Revoke
                    </Button>
                  </div>
                ) : null}
              </div>
              {rebindOfferingRef !== undefined && connection.connectionRef === rebindConnectionRef ? (
                refreshedForRebind === connection.connectionRef ? (
                  <Alert>
                    <AlertTitle>Authority refreshed</AlertTitle>
                    <AlertDescription className="grid gap-3">
                      Re-admit {rebindOfferingRef} now so this Tool binds to the refreshed authority snapshot.
                      <Button asChild className="min-h-touch justify-self-start">
                        <a
                          ref={rebindLinkRef}
                          href={`/owner/operations/${encodeURIComponent(rebindOfferingRef)}#provider`}
                        >
                          Re-admit Tool
                        </a>
                      </Button>
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
