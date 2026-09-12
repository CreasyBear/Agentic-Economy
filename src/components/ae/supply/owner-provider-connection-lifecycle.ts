import type { useServerFn } from '@tanstack/react-start'

import type {
  checkOwnerX402Server,
  revokeOwnerProviderConnectionServer,
  OwnerProviderConnection,
} from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
import type { ProviderConnectionInspection } from './AeProviderConnectionForm'
import {
  HEALTH_CHECK_UNCONFIRMED_TEXTS,
  PROVIDER_CONNECTION_UNCONFIRMED_TEXTS,
  matchesX402Handoff,
  reportCommandFailure,
} from './owner-provider-connections-model'

export type OwnerProviderConnectionLifecycleDeps = Readonly<{
  readOnly: boolean
  x402Handoff: OwnerToolsX402ConnectionIntent | undefined
  environment: 'sandbox' | 'production'
  checkX402: ReturnType<typeof useServerFn<typeof checkOwnerX402Server>>
  revoke: ReturnType<typeof useServerFn<typeof revokeOwnerProviderConnectionServer>>
  refresh: () => Promise<boolean>
  commandIdFor: (key: string) => string
  clearCommand: (key: string) => void
  setBusy: (value: string | undefined) => void
  setNotice: (value: Readonly<{ kind: 'error' | 'status'; text: string }> | undefined) => void
  setRefreshRequired: (value: boolean) => void
  setReauthorizingConnectionRef: (value: string | undefined) => void
  setResourceUrl: (value: string) => void
  setMethod: (value: 'GET' | 'POST') => void
  setInspection: (value: ProviderConnectionInspection | undefined) => void
  setClaimSignature: (value: string | undefined) => void
  focusResourceUrl: () => void
  revokeTarget: OwnerProviderConnection | undefined
  setRevokeTarget: (value: OwnerProviderConnection | undefined) => void
  setRevokePending: (value: boolean) => void
  setRevokeTrigger: (trigger: HTMLButtonElement) => void
  isRevokeInFlight: () => boolean
  setRevokeInFlight: (value: boolean) => void
}>

/** Owns the reauthorize, check and revoke command flows so the state hook stays under the line budget. */
export function useOwnerProviderConnectionLifecycle(deps: OwnerProviderConnectionLifecycleDeps) {
  function failCommand(
    outcome: Parameters<typeof reportCommandFailure>[0],
    commandKey: string,
    texts: typeof PROVIDER_CONNECTION_UNCONFIRMED_TEXTS,
  ) {
    reportCommandFailure(outcome, commandKey, texts, {
      setNotice: deps.setNotice,
      setRefreshRequired: deps.setRefreshRequired,
      clearCommand: deps.clearCommand,
    })
  }

  async function revokeConnection(connection: OwnerProviderConnection) {
    if (deps.readOnly) return
    const commandKey = [
      'revoke',
      connection.connectionRef,
      String(connection.authorityGeneration),
      connection.authorityDigest,
    ].join(':')
    const commandId = deps.commandIdFor(commandKey)
    deps.setBusy(connection.connectionRef)
    deps.setNotice(undefined)
    try {
      const result = await deps.revoke({
        data: {
          connectionRef: connection.connectionRef,
          commandId,
          expectedAuthorityGeneration: connection.authorityGeneration,
          expectedAuthorityDigest: connection.authorityDigest,
        },
      })
      if (result.kind === 'refused') {
        failCommand(result, commandKey, PROVIDER_CONNECTION_UNCONFIRMED_TEXTS)
        return
      }
      deps.clearCommand(commandKey)
      await deps.refresh()
    } catch (cause) {
      failCommand({ kind: 'error', cause }, commandKey, PROVIDER_CONNECTION_UNCONFIRMED_TEXTS)
    } finally {
      deps.setBusy(undefined)
    }
  }

  function beginReauthorization(connection: OwnerProviderConnection) {
    const exactResource = connection.grantedResources[0]
    if (connection.adapterId !== 'x402-fetch:v2'
      || exactResource === undefined
      || connection.x402Method === undefined
      || connection.x402Payee === undefined) {
      deps.setNotice({ kind: 'error', text: 'This connection does not have a complete x402 authority record. Revoke it and connect the endpoint again.' })
      return
    }
    if (deps.x402Handoff !== undefined && !matchesX402Handoff(connection, deps.x402Handoff)) {
      deps.setNotice({ kind: 'error', text: 'This connection does not match the saved source. The exact source handoff remains selected.' })
      return
    }
    deps.setReauthorizingConnectionRef(connection.connectionRef)
    deps.setResourceUrl(exactResource)
    deps.setMethod(connection.x402Method)
    deps.setInspection(undefined)
    deps.setClaimSignature(undefined)
    deps.setNotice({ kind: 'status', text: 'Inspect the exact endpoint and prove current payee control before reauthorizing it.' })
    requestAnimationFrame(deps.focusResourceUrl)
  }

  function cancelReauthorization() {
    deps.setReauthorizingConnectionRef(undefined)
    deps.setResourceUrl('')
    deps.setInspection(undefined)
    deps.setClaimSignature(undefined)
    deps.setNotice({ kind: 'status', text: 'Reauthorization cancelled. No connection changed.' })
  }

  async function checkConnection(connection: OwnerProviderConnection) {
    if (deps.readOnly) return
    const commandKey = [
      'health',
      connection.connectionRef,
      String(connection.authorityGeneration),
      connection.authorityDigest,
    ].join(':')
    deps.setBusy(connection.connectionRef)
    deps.setNotice(undefined)
    try {
      const result = await deps.checkX402({
        data: {
          connectionRef: connection.connectionRef,
          commandId: deps.commandIdFor(commandKey),
          expectedAuthorityGeneration: connection.authorityGeneration,
          expectedAuthorityDigest: connection.authorityDigest,
          environment: connection.sourceEnvironment ?? deps.environment,
        },
      })
      if (result.kind === 'refused') {
        failCommand(result, commandKey, HEALTH_CHECK_UNCONFIRMED_TEXTS)
        return
      }
      deps.clearCommand(commandKey)
      await deps.refresh()
    } catch (cause) {
      failCommand({ kind: 'error', cause }, commandKey, HEALTH_CHECK_UNCONFIRMED_TEXTS)
    } finally {
      deps.setBusy(undefined)
    }
  }

  function requestRevoke(connection: OwnerProviderConnection, trigger: HTMLButtonElement) {
    deps.setRevokeTrigger(trigger)
    deps.setRevokeTarget(connection)
  }

  function closeRevokeDialog(open: boolean) {
    if (!open) deps.setRevokeTarget(undefined)
  }

  async function confirmRevoke() {
    if (deps.revokeTarget === undefined || deps.isRevokeInFlight()) return
    const exactConnection = deps.revokeTarget
    deps.setRevokeInFlight(true)
    deps.setRevokePending(true)
    try {
      await revokeConnection(exactConnection)
      deps.setRevokeTarget(undefined)
    } finally {
      deps.setRevokeInFlight(false)
      deps.setRevokePending(false)
    }
  }

  return { beginReauthorization, cancelReauthorization, checkConnection, requestRevoke, closeRevokeDialog, confirmRevoke }
}
