import { useNavigate, useRouter } from '@tanstack/react-router'
import { useReverification } from '@clerk/tanstack-react-start'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import {
  checkOwnerX402Server,
  connectOwnerX402Server,
  inspectOwnerX402Server,
  revokeOwnerProviderConnectionServer,
  type OwnerProviderConnection,
} from '@/modules/capability-supply/supply-funnel.functions'
import { suggestNextAction } from '@/modules/market/suggested-next-action'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import type { OwnerToolsX402ConnectionIntent } from '@/lib/operator/supply-compatibility'
import type { ProviderConnectionInspection } from './AeProviderConnectionForm'
import {
  connectionRefFromHash,
  sameX402Handoff,
  type PendingX402Return,
  type X402HandoffIdentity,
} from './owner-provider-connections-model'
import { useOwnerProviderConnectionLifecycle } from './owner-provider-connection-lifecycle'
import { useOwnerProviderConnectionFormFlow } from './owner-provider-connection-form-flow'

export type OwnerProviderConnectionsStateProps = Readonly<{
  businessId?: string
  connections: readonly OwnerProviderConnection[]
  readOnly?: boolean
  x402Handoff?: OwnerToolsX402ConnectionIntent
}>

/** Owns provider-connection state, refs, and the six connect/inspect/prove/reauthorize/check/revoke command flows. */
export function useOwnerProviderConnectionsState({
  businessId,
  connections,
  readOnly = false,
  x402Handoff,
}: OwnerProviderConnectionsStateProps) {
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
  const reauthorizing = reauthorizingConnectionRef !== undefined
  const missingConnectionActionLabel = suggestNextAction({
    subject: 'connection',
    state: 'missing',
    actor: 'provider',
  }).label

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

  function clearCommand(key: string): void {
    commandIdsRef.current.delete(key)
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

  function focusResourceUrl() {
    resourceUrlInputRef.current?.scrollIntoView({ block: 'center' })
    resourceUrlInputRef.current?.focus({ preventScroll: true })
  }

  function beginConnection() {
    if (readOnly) return
    focusResourceUrl()
  }

  function setPendingX402Return(value: PendingX402Return | undefined) { pendingX402ReturnRef.current = value }
  function setRevokeTrigger(trigger: HTMLButtonElement) { revokeTriggerRef.current = trigger }
  function isRevokeInFlight(): boolean { return revokeInFlightRef.current }
  function setRevokeInFlight(value: boolean) { revokeInFlightRef.current = value }

  function changeResourceUrl(value: string) {
    setResourceUrl(value)
    setInspection(undefined)
    setClaimSignature(undefined)
  }

  function changeMethod(value: 'GET' | 'POST') {
    setMethod(value)
    setInspection(undefined)
    setClaimSignature(undefined)
  }

  const { submitConnection, inspectConnection, provePayeeControl } = useOwnerProviderConnectionFormFlow({
    readOnly,
    canConnect,
    businessId,
    x402Handoff,
    environment,
    resourceUrl,
    method,
    inspection,
    claimSignature,
    reauthorizingConnectionRef,
    rebindOfferingRef,
    connectX402,
    inspectX402,
    commandIdFor,
    clearCommand,
    refresh,
    setPendingX402Return,
    setBusy,
    setNotice,
    setRefreshRequired,
    setInspection,
    setClaimSignature,
    setResourceUrl,
    setReauthorizingConnectionRef,
    setRefreshedForRebind,
  })

  const lifecycle = useOwnerProviderConnectionLifecycle({
    readOnly,
    x402Handoff,
    environment,
    checkX402,
    revoke,
    refresh,
    commandIdFor,
    clearCommand,
    setBusy,
    setNotice,
    setRefreshRequired,
    setReauthorizingConnectionRef,
    setResourceUrl,
    setMethod,
    setInspection,
    setClaimSignature,
    focusResourceUrl,
    revokeTarget,
    setRevokeTarget,
    setRevokePending,
    setRevokeTrigger,
    isRevokeInFlight,
    setRevokeInFlight,
  })

  return {
    resourceUrl, method, inspection, claimSignature, busy, refreshRequired, notice,
    rebindOfferingRef, rebindConnectionRef, refreshedForRebind, revokeTarget, revokePending,
    rebindLinkRef, resourceUrlInputRef, revokeTriggerRef,
    environment, canConnect, reauthorizing, missingConnectionActionLabel,
    fieldsLocked: reauthorizing || x402Handoff !== undefined,
    beginConnection, changeResourceUrl, changeMethod,
    submitConnection, inspectConnection, provePayeeControl,
    ...lifecycle,
    refresh,
  }
}
