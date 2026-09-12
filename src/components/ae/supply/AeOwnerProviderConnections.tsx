import { useNavigate, useRouter } from '@tanstack/react-router'
import { useReverification } from '@clerk/tanstack-react-start'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'

import { AeSection } from '@/components/ae/layout/AeSection'
import {
  checkOwnerX402Server,
  connectOwnerX402Server,
  inspectOwnerX402Server,
  revokeOwnerProviderConnectionServer,
  type OwnerProviderConnection,
} from '@/modules/capability-supply/supply-funnel.functions'
import { utf8ToHex } from '@/modules/capability-supply/public'
import { suggestNextAction } from '@/modules/market/suggested-next-action'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { degrade } from '@/lib/observability/degrade'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
import { AeProviderConnectionList } from './AeProviderConnectionList'
import { AeProviderConnectionForm, type ProviderConnectionInspection } from './AeProviderConnectionForm'
import {
  connectionRefFromHash,
  connectionRefusalCopy,
  matchesX402Handoff,
  sameX402Handoff,
  type PendingX402Return,
  type X402HandoffIdentity,
} from './owner-provider-connections-model'

export function AeOwnerProviderConnections({
  businessId,
  connections,
  readOnly = false,
  x402Handoff,
}: Readonly<{
  businessId?: string
  connections: readonly OwnerProviderConnection[]
  readOnly?: boolean
  x402Handoff?: OwnerToolsX402ConnectionIntent
}>) {
  const router = useRouter()
  const navigate = useNavigate()
  const connectX402Request = useServerFn(connectOwnerX402Server)
  const connectX402 = useReverification(connectX402Request)
  const checkX402 = useServerFn(checkOwnerX402Server)
  const inspectX402 = useServerFn(inspectOwnerX402Server)
  const revoke = useServerFn(revokeOwnerProviderConnectionServer)
  const [resourceUrl, setResourceUrl] = useState('')
  const [method, setMethod] = useState<'GET' | 'POST'>('POST')
  const [inspection, setInspection] = useState<ProviderConnectionInspection>()
  const [claimSignature, setClaimSignature] = useState<string>()
  const [reauthorizingConnectionRef, setReauthorizingConnectionRef] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'error' | 'status'; text: string }>()
  const [rebindOfferingRef, setRebindOfferingRef] = useState<string>()
  const [rebindConnectionRef, setRebindConnectionRef] = useState<string>()
  const [refreshedForRebind, setRefreshedForRebind] = useState<string>()
  const [revokeTarget, setRevokeTarget] = useState<OwnerProviderConnection>()
  const [revokePending, setRevokePending] = useState(false)
  const rebindLinkRef = useRef<HTMLAnchorElement>(null)
  const resourceUrlInputRef = useRef<HTMLInputElement>(null)
  const revokeTriggerRef = useRef<HTMLButtonElement>(null)
  const revokeInFlightRef = useRef(false)
  const commandIdsRef = useRef(new Map<string, string>())
  const pendingX402ReturnRef = useRef<PendingX402Return | undefined>(undefined)
  const reauthorizingConnection = reauthorizingConnectionRef === undefined
    ? undefined
    : connections.find(({ connectionRef }) => connectionRef === reauthorizingConnectionRef)
  const environment = reauthorizingConnection?.sourceEnvironment ?? x402Handoff?.environment ?? 'production'
  const handoffDraft = x402Handoff?.draft
  const handoffResourceUrl = x402Handoff?.resourceUrl
  const handoffMethod = x402Handoff?.method
  const handoffEnvironment = x402Handoff?.environment
  const currentHandoffRef = useRef<X402HandoffIdentity | undefined>(undefined)
  useLayoutEffect(() => {
    currentHandoffRef.current = handoffDraft === undefined || handoffResourceUrl === undefined || handoffMethod === undefined || handoffEnvironment === undefined
      ? undefined
      : { draft: handoffDraft, resourceUrl: handoffResourceUrl, method: handoffMethod, environment: handoffEnvironment }
  }, [handoffDraft, handoffEnvironment, handoffMethod, handoffResourceUrl])
  const canConnect = !readOnly && businessId !== undefined && businessId.length > 0
  const missingConnectionNextAction = suggestNextAction({
    subject: 'connection',
    state: 'missing',
    actor: 'provider',
  })

  useEffect(() => {
    const focusHashTarget = () => {
      let targetId: string
      try {
        targetId = decodeURIComponent(window.location.hash.replace(/^#/, ''))
      } catch (cause) {
        captureRouteException(cause, { site: 'focusHashTarget' }, 'warning')
        return
      }
      if (
        targetId !== 'provider-connections'
        && targetId !== 'provider-x402-resource-url'
        && !targetId.startsWith('provider-connection-')
      ) return
      const target = document.getElementById(targetId)
      if (target === null) return
      target.scrollIntoView({ block: 'start' })
      target.focus({ preventScroll: true })
    }
    window.addEventListener('hashchange', focusHashTarget)
    focusHashTarget()
    const requestedRebind = new URLSearchParams(window.location.search).get('rebind')?.trim()
    if (requestedRebind !== undefined && requestedRebind.length > 0 && requestedRebind.length <= 300) {
      setRebindOfferingRef(requestedRebind)
      setRebindConnectionRef(connectionRefFromHash())
    }
    return () => window.removeEventListener('hashchange', focusHashTarget)
  }, [])

  useEffect(() => {
    const pendingReturn = pendingX402ReturnRef.current
    if (pendingReturn !== undefined && !sameX402Handoff(pendingReturn.handoff, currentHandoffRef.current)) {
      pendingX402ReturnRef.current = undefined
    }
    setRefreshRequired(false)
    if (handoffDraft === undefined || handoffResourceUrl === undefined || handoffMethod === undefined || handoffEnvironment === undefined) return
    setResourceUrl(handoffResourceUrl)
    setMethod(handoffMethod)
    setReauthorizingConnectionRef(undefined)
    setInspection(undefined)
    setClaimSignature(undefined)
    setNotice({ kind: 'status', text: 'Review the exact source endpoint, then inspect its live x402 payment lane.' })
  }, [handoffDraft, handoffEnvironment, handoffMethod, handoffResourceUrl])

  useEffect(() => {
    if (refreshedForRebind === undefined) return
    rebindLinkRef.current?.focus()
  }, [refreshedForRebind])

  function commandIdFor(actionKey: string): string {
    const current = commandIdsRef.current.get(actionKey)
    if (current !== undefined) return current
    const commandId = crypto.randomUUID()
    commandIdsRef.current.set(actionKey, commandId)
    return commandId
  }

  async function refresh(): Promise<boolean> {
    const refreshHandoff = currentHandoffRef.current
    let navigationAttempted = false
    try {
      await router.invalidate()
      const currentHandoff = currentHandoffRef.current
      const pendingReturn = pendingX402ReturnRef.current
      if (!sameX402Handoff(refreshHandoff, currentHandoff)) {
        if (pendingReturn !== undefined && !sameX402Handoff(pendingReturn.handoff, currentHandoff)) {
          pendingX402ReturnRef.current = undefined
        }
        return false
      }
      if (pendingReturn !== undefined) {
        if (!sameX402Handoff(pendingReturn.handoff, currentHandoff)) {
          pendingX402ReturnRef.current = undefined
        } else {
          navigationAttempted = true
          await navigate({
            to: '/owner/operations/new',
            search: {
              draft: pendingReturn.draft,
              connection: pendingReturn.connection,
              environment: pendingReturn.environment,
            },
            replace: true,
          })
          if (!sameX402Handoff(refreshHandoff, currentHandoffRef.current)) {
            if (pendingX402ReturnRef.current === pendingReturn) pendingX402ReturnRef.current = undefined
            return false
          }
          pendingX402ReturnRef.current = undefined
          setResourceUrl('')
          setReauthorizingConnectionRef(undefined)
          setInspection(undefined)
          setClaimSignature(undefined)
        }
      }
      setRefreshRequired(false)
      setNotice({ kind: 'status', text: 'Provider connections updated.' })
      return true
    } catch (cause) {
      if (!sameX402Handoff(refreshHandoff, currentHandoffRef.current)) return false
      captureClientExceptionOnClient(cause)
      setRefreshRequired(true)
      setNotice({
        kind: 'error',
        text: navigationAttempted
          ? 'The connection was accepted, but AE could not return to the saved Tool. Reload current connections to try again.'
          : 'The change was accepted, but current connections could not be reloaded. Reload before starting another action.',
      })
      return false
    }
  }

  function beginConnection() {
    if (readOnly) return
    resourceUrlInputRef.current?.scrollIntoView({ block: 'center' })
    resourceUrlInputRef.current?.focus({ preventScroll: true })
  }

  async function submitConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || !canConnect || businessId === undefined || inspection === undefined || claimSignature === undefined) return
    const commandKey = ['connect', businessId, method, resourceUrl, inspection.digest, claimSignature].join(':')
    const commandId = commandIdFor(commandKey)
    const reauthorizationRef = reauthorizingConnectionRef
    setBusy('new')
    setNotice(undefined)
    try {
      const result = await connectX402({
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
        if (result.code === 'source_unavailable') {
          setRefreshRequired(true)
          setNotice({ kind: 'error', text: 'The provider connection outcome was not confirmed. Reload current connections before repeating it.' })
          return
        }
        commandIdsRef.current.delete(commandKey)
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code, result.correlationRef) })
        return
      }
      commandIdsRef.current.delete(commandKey)
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
        pendingX402ReturnRef.current = pendingReturn
      }
      if (x402Handoff === undefined) {
        setResourceUrl('')
        setReauthorizingConnectionRef(undefined)
      }
      setInspection(undefined)
      setClaimSignature(undefined)
      const refreshed = await refresh()
      if (refreshed && reauthorizationRef !== undefined) {
        setReauthorizingConnectionRef(undefined)
      }
      if (refreshed && reauthorizationRef !== undefined && rebindOfferingRef !== undefined) {
        setRefreshedForRebind(reauthorizationRef)
        setNotice({
          kind: 'status',
          text: 'Authority reauthorized. Re-admit the exact Tool so its binding uses the new generation and digest.',
        })
      }
    } catch (cause) {
      if (isReverificationCancelledError(cause)) {
        setNotice({ kind: 'status', text: 'Reverification was cancelled. No connection changed; your inspected endpoint and wallet proof remain on this page.' })
        return
      }
      captureClientExceptionOnClient(cause)
      setRefreshRequired(true)
      setNotice({
        kind: 'error',
        text: 'The provider connection outcome was not confirmed. Reload current connections first; an unchanged retry will reuse the same command reference.',
      })
    } finally {
      setBusy(undefined)
    }
  }

  async function inspectConnection() {
    if (businessId === undefined) return
    setBusy('inspect')
    setNotice(undefined)
    setInspection(undefined)
    setClaimSignature(undefined)
    try {
      const result = await inspectX402({
        data: { businessId, resourceUrl, method, environment },
      })
      if (result.kind === 'refused') {
        setNotice({ kind: 'error', text: result.action })
        return
      }
      if (result.payment.selection.kind !== 'selected') {
        setNotice({ kind: 'error', text: result.payment.selection.action })
        return
      }
      const selectedAlternativeId = result.payment.selection.alternativeId
      const selected = result.payment.accepts.find(
        (candidate) => candidate.alternativeId === selectedAlternativeId,
      )
      if (selected === undefined) {
        setNotice({ kind: 'error', text: 'The endpoint returned an inconsistent payment challenge.' })
        return
      }
      if (!('claim' in result)) {
        setNotice({ kind: 'error', text: 'AE could not prepare the payee ownership claim.' })
        return
      }
      setInspection({
        digest: result.digest,
        payTo: selected.payTo,
        amount: selected.amount,
        network: selected.network,
        asset: selected.asset,
        claimMessage: result.claim.message,
        claimExpiresAt: result.claim.expiresAt,
      })
      setNotice({ kind: 'status', text: 'Live x402 challenge found. Review the exact payment lane, then connect it.' })
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setNotice({ kind: 'error', text: 'AE could not inspect the endpoint. Check that it is publicly reachable and try again.' })
    } finally {
      setBusy(undefined)
    }
  }

  async function provePayeeControl() {
    if (inspection === undefined) return
    const ethereum = (window as Window & {
      ethereum?: { request(input: Readonly<{ method: 'personal_sign'; params: readonly string[] }>): Promise<string> }
    }).ethereum
    if (ethereum === undefined) {
      setNotice({ kind: 'error', text: 'Open this page in a browser with the wallet that controls the payee address.' })
      return
    }
    setBusy('claim')
    setNotice(undefined)
    try {
      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [utf8ToHex(inspection.claimMessage), inspection.payTo],
      })
      if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        throw new Error('invalid_signature')
      }
      setClaimSignature(signature)
      setNotice({ kind: 'status', text: `Payee control proved. AE will verify the live challenge again when you ${reauthorizingConnectionRef === undefined ? 'connect' : 'reauthorize'}.` })
    } catch (cause) {
      setNotice(degrade(cause, { kind: 'error', text: 'The payee ownership signature was not completed.' }, { site: 'provePayeeControl', reason: 'source_unavailable' }))
    } finally {
      setBusy(undefined)
    }
  }

  async function updateConnection(
    action: 'revoke',
    connection: OwnerProviderConnection,
  ) {
    if (readOnly) return
    const commandKey = [
      action,
      connection.connectionRef,
      String(connection.authorityGeneration),
      connection.authorityDigest,
    ].join(':')
    const commandId = commandIdFor(commandKey)
    setBusy(connection.connectionRef)
    setNotice(undefined)
    const data = {
      connectionRef: connection.connectionRef,
      commandId,
      expectedAuthorityGeneration: connection.authorityGeneration,
      expectedAuthorityDigest: connection.authorityDigest,
    }
    try {
      const result = await revoke({ data })
      if (result.kind === 'refused') {
        if (result.code === 'source_unavailable') {
          setRefreshRequired(true)
          setNotice({ kind: 'error', text: 'The provider connection outcome was not confirmed. Reload current connections before repeating it.' })
          return
        }
        commandIdsRef.current.delete(commandKey)
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code, result.correlationRef) })
        return
      }
      commandIdsRef.current.delete(commandKey)
      await refresh()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setRefreshRequired(true)
      setNotice({
        kind: 'error',
        text: 'The provider connection outcome was not confirmed. Reload current connections first; an unchanged retry will reuse the same command reference.',
      })
    } finally {
      setBusy(undefined)
    }
  }

  function beginReauthorization(connection: OwnerProviderConnection) {
    const exactResource = connection.grantedResources[0]
    if (connection.adapterId !== 'x402-fetch:v2'
      || exactResource === undefined
      || connection.x402Method === undefined
      || connection.x402Payee === undefined) {
      setNotice({ kind: 'error', text: 'This connection does not have a complete x402 authority record. Revoke it and connect the endpoint again.' })
      return
    }
    if (x402Handoff !== undefined && !matchesX402Handoff(connection, x402Handoff)) {
      setNotice({ kind: 'error', text: 'This connection does not match the saved source. The exact source handoff remains selected.' })
      return
    }
    setReauthorizingConnectionRef(connection.connectionRef)
    setResourceUrl(exactResource)
    setMethod(connection.x402Method)
    setInspection(undefined)
    setClaimSignature(undefined)
    setNotice({ kind: 'status', text: 'Inspect the exact endpoint and prove current payee control before reauthorizing it.' })
    requestAnimationFrame(() => {
      resourceUrlInputRef.current?.scrollIntoView({ block: 'center' })
      resourceUrlInputRef.current?.focus({ preventScroll: true })
    })
  }

  async function checkConnection(connection: OwnerProviderConnection) {
    if (readOnly) return
    const commandKey = [
      'health',
      connection.connectionRef,
      String(connection.authorityGeneration),
      connection.authorityDigest,
    ].join(':')
    setBusy(connection.connectionRef)
    setNotice(undefined)
    try {
      const result = await checkX402({
        data: {
          connectionRef: connection.connectionRef,
          commandId: commandIdFor(commandKey),
          expectedAuthorityGeneration: connection.authorityGeneration,
          expectedAuthorityDigest: connection.authorityDigest,
          environment: connection.sourceEnvironment ?? environment,
        },
      })
      if (result.kind === 'refused') {
        if (result.code === 'source_unavailable') {
          setRefreshRequired(true)
          setNotice({ kind: 'error', text: 'The health-check outcome was not confirmed. Reload current connections before repeating it.' })
          return
        }
        commandIdsRef.current.delete(commandKey)
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code, result.correlationRef) })
        return
      }
      commandIdsRef.current.delete(commandKey)
      await refresh()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setRefreshRequired(true)
      setNotice({
        kind: 'error',
        text: 'The health-check outcome was not confirmed. Reload current connections first; an unchanged retry will reuse the same command reference.',
      })
    } finally {
      setBusy(undefined)
    }
  }

  function requestRevoke(
    connection: OwnerProviderConnection,
    trigger: HTMLButtonElement,
  ) {
    revokeTriggerRef.current = trigger
    setRevokeTarget(connection)
  }

  async function confirmRevoke() {
    if (revokeTarget === undefined || revokeInFlightRef.current) return
    const exactConnection = revokeTarget
    revokeInFlightRef.current = true
    setRevokePending(true)
    try {
      await updateConnection('revoke', exactConnection)
      setRevokeTarget(undefined)
    } finally {
      revokeInFlightRef.current = false
      setRevokePending(false)
    }
  }

  return (
    <div
      id="provider-connections"
      tabIndex={-1}
      className="scroll-mt-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <AeSection
        title="Provider connections"
        description="Connect a hosted x402 endpoint so Agentic Economy can route paid calls without collecting an API key or wallet secret. Then open a Tool and select this connection as its access authority."
      >
        <AeProviderConnectionList
          connections={connections}
          readOnly={readOnly}
          {...(busy === undefined ? {} : { busy })}
          refreshRequired={refreshRequired}
          {...(rebindOfferingRef === undefined ? {} : { rebindOfferingRef })}
          {...(rebindConnectionRef === undefined ? {} : { rebindConnectionRef })}
          {...(refreshedForRebind === undefined ? {} : { refreshedForRebind })}
          rebindLinkRef={rebindLinkRef}
          missingConnectionActionLabel={missingConnectionNextAction.label}
          onBeginConnection={beginConnection}
          onCheckConnection={(connection) => void checkConnection(connection)}
          onBeginReauthorization={beginReauthorization}
          onRequestRevoke={requestRevoke}
          {...(revokeTarget === undefined ? {} : { revokeTarget })}
          revokePending={revokePending}
          revokeTriggerRef={revokeTriggerRef}
          onRevokeOpenChange={(open) => {
            if (!open) setRevokeTarget(undefined)
          }}
          onConfirmRevoke={() => void confirmRevoke()}
        />
        <AeProviderConnectionForm
          canConnect={canConnect}
          readOnly={readOnly}
          resourceUrl={resourceUrl}
          method={method}
          environment={environment}
          {...(inspection === undefined ? {} : { inspection })}
          {...(claimSignature === undefined ? {} : { claimSignature })}
          {...(busy === undefined ? {} : { busy })}
          refreshRequired={refreshRequired}
          reauthorizing={reauthorizingConnectionRef !== undefined}
          fieldsLocked={reauthorizingConnectionRef !== undefined || x402Handoff !== undefined}
          resourceUrlInputRef={resourceUrlInputRef}
          onResourceUrlChange={(value) => {
            setResourceUrl(value)
            setInspection(undefined)
            setClaimSignature(undefined)
          }}
          onMethodChange={(value) => {
            setMethod(value)
            setInspection(undefined)
            setClaimSignature(undefined)
          }}
          onSubmit={submitConnection}
          onInspect={() => void inspectConnection()}
          onProvePayeeControl={() => void provePayeeControl()}
          onCancelReauthorization={() => {
            setReauthorizingConnectionRef(undefined)
            setResourceUrl('')
            setInspection(undefined)
            setClaimSignature(undefined)
            setNotice({ kind: 'status', text: 'Reauthorization cancelled. No connection changed.' })
          }}
          {...(notice === undefined ? {} : { notice })}
          onRefresh={() => void refresh()}
        />
      </AeSection>
    </div>
  )
}
