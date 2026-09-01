import { Link, useRouter } from '@tanstack/react-router'
import { useReverification } from '@clerk/tanstack-react-start'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { useServerFn } from '@tanstack/react-start'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  checkOwnerX402Server,
  connectOwnerX402Server,
  inspectOwnerX402Server,
  retryOwnerProviderConnectionCleanupServer,
  revokeOwnerProviderConnectionServer,
  type OwnerProviderConnection,
} from '@/modules/capability-supply/supply-funnel.functions'
import { utf8ToHex } from '@/modules/capability-supply/public'
import { providerConnectionTargetId } from './provider-connection-target'
import { suggestContinuation } from '@/modules/market/suggested-continuation'
import { formatRelativeTime, formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

export function AeOwnerProviderConnections({
  businessId,
  connections,
  readOnly = false,
}: Readonly<{
  businessId?: string
  connections: readonly OwnerProviderConnection[]
  readOnly?: boolean
}>) {
  const router = useRouter()
  const connectX402Request = useServerFn(connectOwnerX402Server)
  const connectX402 = useReverification(connectX402Request)
  const checkX402 = useServerFn(checkOwnerX402Server)
  const inspectX402 = useServerFn(inspectOwnerX402Server)
  const revoke = useServerFn(revokeOwnerProviderConnectionServer)
  const retryCleanup = useServerFn(retryOwnerProviderConnectionCleanupServer)
  const [resourceUrl, setResourceUrl] = useState('')
  const [method, setMethod] = useState<'GET' | 'POST'>('POST')
  const [inspection, setInspection] = useState<Readonly<{
    digest: string
    payTo: string
    amount: string
    network: string
    asset: string
    claimMessage: string
    claimExpiresAt: number
  }>>()
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
  const canConnect = !readOnly && businessId !== undefined && businessId.length > 0
  const missingConnectionContinuation = suggestContinuation({
    subject: 'connection',
    state: 'missing',
    actor: 'supplier',
  })

  useEffect(() => {
    const focusHashTarget = () => {
      let targetId: string
      try {
        targetId = decodeURIComponent(window.location.hash.replace(/^#/, ''))
      } catch {
        return
      }
      if (
        targetId !== 'supplier-connections'
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
    try {
      await router.invalidate()
      setRefreshRequired(false)
      setNotice({ kind: 'status', text: 'Supplier connections updated.' })
      return true
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setRefreshRequired(true)
      setNotice({
        kind: 'error',
        text: 'The change was accepted, but current connections could not be reloaded. Reload before starting another action.',
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
          environment: 'production',
          claimExpiresAt: inspection.claimExpiresAt,
          claimSignature,
          commandId,
        },
      })
      if (result.kind === 'refused') {
        if (result.code === 'source_unavailable') {
          setRefreshRequired(true)
          setNotice({ kind: 'error', text: 'The supplier connection outcome was not confirmed. Reload current connections before repeating it.' })
          return
        }
        commandIdsRef.current.delete(commandKey)
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code, result.correlationRef) })
        return
      }
      commandIdsRef.current.delete(commandKey)
      setResourceUrl('')
      setReauthorizingConnectionRef(undefined)
      setInspection(undefined)
      setClaimSignature(undefined)
      const refreshed = await refresh()
      if (refreshed && reauthorizationRef !== undefined && rebindOfferingRef !== undefined) {
        setRefreshedForRebind(reauthorizationRef)
        setNotice({
          kind: 'status',
          text: 'Authority reauthorized. Re-admit the exact Operation so its binding uses the new generation and digest.',
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
        text: 'The supplier connection outcome was not confirmed. Reload current connections first; an unchanged retry will reuse the same command reference.',
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
        data: { businessId, resourceUrl, method, environment: 'production' },
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
    } catch {
      setNotice({ kind: 'error', text: 'The payee ownership signature was not completed.' })
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
          setNotice({ kind: 'error', text: 'The supplier connection outcome was not confirmed. Reload current connections before repeating it.' })
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
        text: 'The supplier connection outcome was not confirmed. Reload current connections first; an unchanged retry will reuse the same command reference.',
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
          environment: 'production',
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

  async function retryConnectionCleanup(connection: OwnerProviderConnection) {
    if (readOnly) return
    const commandKey = `cleanup:${connection.connectionRef}`
    setBusy(connection.connectionRef)
    setNotice(undefined)
    try {
      const result = await retryCleanup({
        data: {
          connectionRef: connection.connectionRef,
          commandId: commandIdFor(commandKey),
        },
      })
      if (result.kind === 'refused') {
        if (result.code === 'source_unavailable') {
          setRefreshRequired(true)
          setNotice({ kind: 'error', text: 'The cleanup outcome was not confirmed. Reload current connections before repeating it.' })
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
        text: 'The cleanup outcome was not confirmed. Reload current connections first; an unchanged retry will reuse the same command reference.',
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
      id="supplier-connections"
      tabIndex={-1}
      className="scroll-mt-6 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <AeSection
        title="Supplier connections"
        description="Connect a hosted x402 endpoint so Agentic Economy can route paid calls without collecting an API key or wallet secret. Then open an operation and select this connection as its access authority."
      >
      {connections.length === 0 ? (
        <AeEmptyState
          title="No provider connection yet"
          description="Add the public HTTPS endpoint that returns the x402 payment challenge for your operation."
          action={readOnly ? undefined : (
            <Button type="button" className="min-h-touch" onClick={beginConnection}>
              {missingConnectionContinuation.label}
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
                  <p className="text-sm text-muted-foreground">Operation readiness is checked per Operation and is not implied by connection health.</p>
                  <AeCopyReference label="connection reference" value={connection.connectionRef} />
                </div>
                {(connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required') ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-touch"
                      disabled={readOnly || busy !== undefined || refreshRequired}
                      onClick={() => void checkConnection(connection)}
                    >
                      {busy === connection.connectionRef ? 'Checking…' : 'Check connection'}
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-touch"
                      disabled={readOnly || busy !== undefined || refreshRequired}
                      onClick={() => beginReauthorization(connection)}
                    >
                      Reauthorize
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-touch"
                      disabled={readOnly || busy !== undefined || refreshRequired}
                      onClick={(event) => requestRevoke(connection, event.currentTarget)}
                    >
                      Revoke
                    </Button>
                  </div>
                ) : connection.lifecycle === 'cleanup_required' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-touch"
                    disabled={readOnly || busy !== undefined || refreshRequired}
                    onClick={() => void retryConnectionCleanup(connection)}
                  >
                    Retry cleanup
                  </Button>
                ) : null}
              </div>
              {rebindOfferingRef !== undefined && connection.connectionRef === rebindConnectionRef ? (
                refreshedForRebind === connection.connectionRef ? (
                  <Alert>
                    <AlertTitle>Authority refreshed</AlertTitle>
                    <AlertDescription className="grid gap-3">
                      Re-admit {rebindOfferingRef} now so this Operation binds to the refreshed authority snapshot.
                      <Button asChild className="min-h-touch justify-self-start">
                        <a
                          ref={rebindLinkRef}
                          href={`/owner/supply/${encodeURIComponent(rebindOfferingRef)}#provider`}
                        >
                          Re-admit Operation
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
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(undefined)
        }}
        title="Revoke this provider connection?"
        description={revokeTarget === undefined
          ? ''
          : `Revoke access to ${providerConnectionResource(revokeTarget)}. New calls through this connection will stop. Operations that use it need a replacement connection and re-admission before they can accept new calls.`}
        confirmLabel="Revoke provider connection"
        confirmVariant="destructive"
        pending={revokePending}
        onConfirm={confirmRevoke}
        returnFocusRef={revokeTriggerRef}
      />
      {canConnect ? (
        <form className="grid gap-3" onSubmit={submitConnection}>
          <div className="grid gap-1.5">
            <label htmlFor="provider-x402-resource-url" className="text-sm font-medium text-foreground">x402 resource URL</label>
            <Input
              ref={resourceUrlInputRef}
              id="provider-x402-resource-url"
              name="resourceUrl"
              type="url"
              inputMode="url"
              autoComplete="url"
              maxLength={2_048}
              placeholder="https://api.example.com/paid-operation"
              value={resourceUrl}
              readOnly={reauthorizingConnectionRef !== undefined}
              onChange={(event) => {
                setResourceUrl(event.target.value)
                setInspection(undefined)
                setClaimSignature(undefined)
              }}
              aria-describedby="provider-x402-resource-url-hint"
              required
            />
            <p id="provider-x402-resource-url-hint" className="text-sm text-muted-foreground">Use the exact public route that returns HTTP 402 when called without payment.</p>
          </div>
          <div className="grid max-w-40 gap-1.5">
            <label htmlFor="provider-x402-method" className="text-sm font-medium text-foreground">Request method</label>
            <select
              id="provider-x402-method"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={method}
              disabled={busy !== undefined || reauthorizingConnectionRef !== undefined}
              onChange={(event) => {
                setMethod(event.currentTarget.value === 'GET' ? 'GET' : 'POST')
                setInspection(undefined)
                setClaimSignature(undefined)
              }}
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </div>
          {inspection === undefined ? null : (
            <Alert>
              <AlertTitle>Exact payment lane observed</AlertTitle>
              <AlertDescription className="grid gap-1">
                <span>Amount: {inspection.amount}</span>
                <span>Network: {inspection.network}</span>
                <span className="break-all">Asset: {inspection.asset}</span>
                <span className="break-all">Payee: {inspection.payTo}</span>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-touch"
              disabled={busy !== undefined || resourceUrl.trim().length === 0}
              onClick={() => void inspectConnection()}
            >
              {busy === 'inspect' ? 'Inspecting…' : 'Inspect endpoint'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-touch"
              disabled={busy !== undefined || inspection === undefined || claimSignature !== undefined}
              onClick={() => void provePayeeControl()}
            >
              {claimSignature !== undefined ? 'Payee control proved' : busy === 'claim' ? 'Waiting for wallet…' : 'Prove payee control'}
            </Button>
            <Button type="submit" className="min-h-touch" disabled={busy !== undefined || refreshRequired || inspection === undefined || claimSignature === undefined}>
              {busy === 'new'
                ? reauthorizingConnectionRef === undefined ? 'Connecting…' : 'Reauthorizing…'
                : reauthorizingConnectionRef === undefined ? 'Connect verified endpoint' : 'Reauthorize verified endpoint'}
            </Button>
            {reauthorizingConnectionRef === undefined ? null : (
              <Button
                type="button"
                variant="ghost"
                className="min-h-touch"
                disabled={busy !== undefined}
                onClick={() => {
                  setReauthorizingConnectionRef(undefined)
                  setResourceUrl('')
                  setInspection(undefined)
                  setClaimSignature(undefined)
                  setNotice({ kind: 'status', text: 'Reauthorization cancelled. No connection changed.' })
                }}
              >
                Cancel reauthorization
              </Button>
            )}
          </div>
        </form>
      ) : readOnly ? null : (
        <AeEmptyState
          title="Supplier identity is required to connect"
          description="Create an unpublished supplier workspace, then return here to inspect and claim the x402 endpoint."
          action={
            <Button asChild className="min-h-touch">
              <Link to="/owner/offerings">Create supplier workspace</Link>
            </Button>
          }
        />
      )}
      <p
        role={notice?.kind === 'error' ? 'alert' : 'status'}
        className={notice?.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
      >
        {notice?.text ?? ''}
      </p>
      {refreshRequired ? (
        <Button
          type="button"
          variant="secondary"
          className="min-h-touch justify-self-start"
          disabled={busy !== undefined}
          onClick={() => void refresh()}
        >
          Reload current connections
        </Button>
      ) : null}
      </AeSection>
    </div>
  )
}

function providerConnectionResource(connection: OwnerProviderConnection): string {
  return connection.grantedResources[0] ?? connection.providerAccountRef
}

function providerConnectionStatus(connection: OwnerProviderConnection): string {
  switch (connection.lifecycle) {
    case 'active':
      return connection.available ? 'Connection active' : 'Connection authority expired'
    case 'reauthorization_required':
      return 'Reconnect required'
    case 'revocation_pending':
      return 'Revocation in progress'
    case 'cleanup_required':
      return 'Cleanup required'
    case 'revoked':
      return 'Revoked'
    default: {
      const exhaustive: never = connection.lifecycle
      return exhaustive
    }
  }
}

function providerConnectionHealth(connection: OwnerProviderConnection): string {
  if (connection.healthStatus === undefined || connection.healthCheckedAt === undefined) {
    return 'Connection health not checked yet'
  }
  const observed = `${formatRelativeTime(connection.healthCheckedAt)} · ${formatTimestamp(connection.healthCheckedAt)}`
  if (connection.healthStatus === 'healthy') {
    return `Healthy unpaid x402 challenge observed ${observed}; payee ${connection.healthSubject ?? 'not recorded'}`
  }
  return `Health needs attention (${connection.healthReasonCode ?? 'unavailable'}) · checked ${observed}`
}

function connectionRefusalCopy(code: string, correlationRef?: string): string {
  if (code === 'security_control_unavailable') {
    return `The security control is unavailable, so no supplier authority was changed.${correlationRef === undefined ? '' : ` Reference ${correlationRef}.`}`
  }
  if (code === 'reauthentication_required' || code === 'proof_stale') return 'Verify your identity again before changing this supplier authority.'
  if (code === 'proof_replayed' || code === 'command_changed') return 'The verified command no longer matches this change. Review the connection and verify again.'
  if (code === 'rate_limited') return 'Too many supplier-authority changes were attempted. Wait, then reload the current connection before trying again.'
  if (code === 'claim_invalid' || code === 'invalid_identity') return 'The payee claim expired or no longer matches this supplier and endpoint. Inspect it and sign again.'
  if (code === 'inspection_ambiguous') return 'The endpoint now exposes more than one supported payment lane. Make one Base USDC exact lane unambiguous, then inspect again.'
  if (code === 'inspection_unsupported') return 'The endpoint no longer exposes AE’s supported Base USDC exact payment lane.'
  if (code.startsWith('inspection_')) return 'The live x402 challenge changed or is no longer valid. Inspect the endpoint again.'
  if (code === 'connection_resource_conflict') return 'This x402 endpoint is already connected to another provider.'
  if (code === 'credential_resource_conflict') return 'This endpoint is already connected with a different authority method.'
  if (code === 'authentication_required' || code === 'authorization_denied') return 'Sign in as the provider owner and try again.'
  if (code === 'authority_conflict') return 'This connection changed in another session. Reload and try again.'
  if (code === 'invalid_resource') return 'Enter a public HTTPS x402 resource URL.'
  return 'The provider connection could not be updated. Reload and try again.'
}

function connectionRefFromHash(): string | undefined {
  try {
    const targetId = decodeURIComponent(window.location.hash.replace(/^#/, ''))
    return targetId.startsWith('provider-connection-')
      ? targetId.slice('provider-connection-'.length)
      : undefined
  } catch {
    return undefined
  }
}
