import type { useReverification } from '@clerk/tanstack-react-start'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import type { useServerFn } from '@tanstack/react-start'
import type { FormEvent } from 'react'

import type {
  connectOwnerX402Server,
  inspectOwnerX402Server,
} from '@/modules/capability-supply/supply-funnel.functions'
import { utf8ToHex } from '@/modules/capability-supply/public'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { degrade } from '@/lib/observability/degrade'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
import type { ProviderConnectionInspection } from './AeProviderConnectionForm'
import {
  PROVIDER_CONNECTION_UNCONFIRMED_TEXTS,
  reportCommandFailure,
} from './owner-provider-connections-model'
import type { PendingX402Return } from './owner-provider-connections-model'

export type OwnerProviderConnectionFormFlowDeps = Readonly<{
  readOnly: boolean
  canConnect: boolean
  businessId: string | undefined
  x402Handoff: OwnerToolsX402ConnectionIntent | undefined
  environment: 'sandbox' | 'production'
  resourceUrl: string
  method: 'GET' | 'POST'
  inspection: ProviderConnectionInspection | undefined
  claimSignature: string | undefined
  reauthorizingConnectionRef: string | undefined
  rebindOfferingRef: string | undefined
  connectX402: ReturnType<typeof useReverification<ReturnType<typeof useServerFn<typeof connectOwnerX402Server>>>>
  inspectX402: ReturnType<typeof useServerFn<typeof inspectOwnerX402Server>>
  commandIdFor: (key: string) => string
  clearCommand: (key: string) => void
  refresh: () => Promise<boolean>
  setPendingX402Return: (value: PendingX402Return | undefined) => void
  setBusy: (value: string | undefined) => void
  setNotice: (value: Readonly<{ kind: 'error' | 'status'; text: string }> | undefined) => void
  setRefreshRequired: (value: boolean) => void
  setInspection: (value: ProviderConnectionInspection | undefined) => void
  setClaimSignature: (value: string | undefined) => void
  setResourceUrl: (value: string) => void
  setReauthorizingConnectionRef: (value: string | undefined) => void
  setRefreshedForRebind: (value: string | undefined) => void
}>

/** Owns the connect, inspect and prove-payee command flows so the state hook stays under the line budget. */
export function useOwnerProviderConnectionFormFlow(deps: OwnerProviderConnectionFormFlowDeps) {
  function failCommand(
    outcome: Parameters<typeof reportCommandFailure>[0],
    commandKey: string,
  ) {
    reportCommandFailure(outcome, commandKey, PROVIDER_CONNECTION_UNCONFIRMED_TEXTS, {
      setNotice: deps.setNotice,
      setRefreshRequired: deps.setRefreshRequired,
      clearCommand: deps.clearCommand,
    })
  }

  async function submitConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (deps.readOnly || !deps.canConnect || deps.businessId === undefined || deps.inspection === undefined || deps.claimSignature === undefined) return
    const { businessId, method, resourceUrl, inspection, claimSignature, environment, x402Handoff } = deps
    const commandKey = ['connect', businessId, method, resourceUrl, inspection.digest, claimSignature].join(':')
    const commandId = deps.commandIdFor(commandKey)
    const reauthorizationRef = deps.reauthorizingConnectionRef
    deps.setBusy('new')
    deps.setNotice(undefined)
    try {
      const result = await deps.connectX402({
        data: {
          businessId,
          resourceUrl,
          method,
          environment,
          claimExpiresAt: inspection.claimExpiresAt,
          claimSignature,
          commandId,
        },
      })
      if (result.kind === 'refused') {
        failCommand(result, commandKey)
        return
      }
      deps.clearCommand(commandKey)
      const pendingReturn = reauthorizationRef === undefined
        && x402Handoff !== undefined
        && result.connection.connectionRef.length > 0
        ? {
            draft: x402Handoff.draft,
            connection: result.connection.connectionRef,
            environment: x402Handoff.environment,
            handoff: {
              draft: x402Handoff.draft,
              resourceUrl: x402Handoff.resourceUrl,
              method: x402Handoff.method,
              environment: x402Handoff.environment,
            },
          }
        : undefined
      if (pendingReturn !== undefined) {
        deps.setPendingX402Return(pendingReturn)
      }
      if (x402Handoff === undefined) {
        deps.setResourceUrl('')
        deps.setReauthorizingConnectionRef(undefined)
      }
      deps.setInspection(undefined)
      deps.setClaimSignature(undefined)
      const refreshed = await deps.refresh()
      if (refreshed && reauthorizationRef !== undefined) {
        deps.setReauthorizingConnectionRef(undefined)
      }
      if (refreshed && reauthorizationRef !== undefined && deps.rebindOfferingRef !== undefined) {
        deps.setRefreshedForRebind(reauthorizationRef)
        deps.setNotice({
          kind: 'status',
          text: 'Authority reauthorized. Re-admit the exact Tool so its binding uses the new generation and digest.',
        })
      }
    } catch (cause) {
      if (isReverificationCancelledError(cause)) {
        deps.setNotice({ kind: 'status', text: 'Reverification was cancelled. No connection changed; your inspected endpoint and wallet proof remain on this page.' })
        return
      }
      failCommand({ kind: 'error', cause }, commandKey)
    } finally {
      deps.setBusy(undefined)
    }
  }

  async function inspectConnection() {
    if (deps.businessId === undefined) return
    const { businessId, resourceUrl, method, environment } = deps
    deps.setBusy('inspect')
    deps.setNotice(undefined)
    deps.setInspection(undefined)
    deps.setClaimSignature(undefined)
    try {
      const result = await deps.inspectX402({
        data: { businessId, resourceUrl, method, environment },
      })
      if (result.kind === 'refused') {
        deps.setNotice({ kind: 'error', text: result.action })
        return
      }
      if (result.payment.selection.kind !== 'selected') {
        deps.setNotice({ kind: 'error', text: result.payment.selection.action })
        return
      }
      const selectedAlternativeId = result.payment.selection.alternativeId
      const selected = result.payment.accepts.find(
        (candidate) => candidate.alternativeId === selectedAlternativeId,
      )
      if (selected === undefined) {
        deps.setNotice({ kind: 'error', text: 'The endpoint returned an inconsistent payment challenge.' })
        return
      }
      if (!('claim' in result)) {
        deps.setNotice({ kind: 'error', text: 'AE could not prepare the payee ownership claim.' })
        return
      }
      deps.setInspection({
        digest: result.digest,
        payTo: selected.payTo,
        amount: selected.amount,
        network: selected.network,
        asset: selected.asset,
        claimMessage: result.claim.message,
        claimExpiresAt: result.claim.expiresAt,
      })
      deps.setNotice({ kind: 'status', text: 'Live x402 challenge found. Review the exact payment lane, then connect it.' })
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      deps.setNotice({ kind: 'error', text: 'AE could not inspect the endpoint. Check that it is publicly reachable and try again.' })
    } finally {
      deps.setBusy(undefined)
    }
  }

  async function provePayeeControl() {
    const inspection = deps.inspection
    if (inspection === undefined) return
    const ethereum = (window as Window & {
      ethereum?: { request(input: Readonly<{ method: 'personal_sign'; params: readonly string[] }>): Promise<string> }
    }).ethereum
    if (ethereum === undefined) {
      deps.setNotice({ kind: 'error', text: 'Open this page in a browser with the wallet that controls the payee address.' })
      return
    }
    deps.setBusy('claim')
    deps.setNotice(undefined)
    try {
      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [utf8ToHex(inspection.claimMessage), inspection.payTo],
      })
      if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        throw new Error('invalid_signature')
      }
      deps.setClaimSignature(signature)
      deps.setNotice({ kind: 'status', text: `Payee control proved. AE will verify the live challenge again when you ${deps.reauthorizingConnectionRef === undefined ? 'connect' : 'reauthorize'}.` })
    } catch (cause) {
      deps.setNotice(degrade(cause, { kind: 'error', text: 'The payee ownership signature was not completed.' }, { site: 'provePayeeControl', reason: 'source_unavailable' }))
    } finally {
      deps.setBusy(undefined)
    }
  }

  return { submitConnection, inspectConnection, provePayeeControl }
}
