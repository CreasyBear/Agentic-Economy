import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useState, type FormEvent } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  connectOwnerX402Server,
  reconnectOwnerProviderConnectionServer,
  retryOwnerProviderConnectionCleanupServer,
  revokeOwnerProviderConnectionServer,
  type OwnerProviderConnection,
} from '@/modules/capability-supply/supply-funnel.functions'

export function AeOwnerProviderConnections({
  businessId,
  connections,
}: Readonly<{
  businessId?: string
  connections: readonly OwnerProviderConnection[]
}>) {
  const router = useRouter()
  const connectX402 = useServerFn(connectOwnerX402Server)
  const reconnect = useServerFn(reconnectOwnerProviderConnectionServer)
  const revoke = useServerFn(revokeOwnerProviderConnectionServer)
  const retryCleanup = useServerFn(retryOwnerProviderConnectionCleanupServer)
  const [resourceUrl, setResourceUrl] = useState('')
  const [busy, setBusy] = useState<string>()
  const [notice, setNotice] = useState<{ kind: 'error' | 'status'; text: string }>()
  const canConnect = businessId !== undefined && businessId.length > 0

  async function refresh() {
    await router.invalidate()
    setNotice({ kind: 'status', text: 'Supplier connections updated.' })
  }

  async function submitConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canConnect || businessId === undefined) return
    const commandId = crypto.randomUUID()
    setBusy('new')
    setNotice(undefined)
    try {
      const result = await connectX402({
        data: {
          businessId,
          resourceUrl,
          commandId,
        },
      })
      if (result.kind === 'refused') {
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code) })
        return
      }
      setResourceUrl('')
      await refresh()
    } catch {
      setNotice({ kind: 'error', text: 'The supplier connection could not be saved. Try again.' })
    } finally {
      setBusy(undefined)
    }
  }

  async function updateConnection(
    action: 'reconnect' | 'revoke',
    connection: OwnerProviderConnection,
  ) {
    const commandId = crypto.randomUUID()
    setBusy(connection.connectionRef)
    setNotice(undefined)
    const data = {
      connectionRef: connection.connectionRef,
      commandId,
      expectedAuthorityGeneration: connection.authorityGeneration,
      expectedAuthorityDigest: connection.authorityDigest,
    }
    try {
      const result = action === 'reconnect'
        ? await reconnect({ data })
        : await revoke({ data })
      if (result.kind === 'refused') {
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code) })
        return
      }
      await refresh()
    } catch {
      setNotice({ kind: 'error', text: 'The supplier connection could not be updated. Try again.' })
    } finally {
      setBusy(undefined)
    }
  }

  async function retryConnectionCleanup(connection: OwnerProviderConnection) {
    setBusy(connection.connectionRef)
    setNotice(undefined)
    try {
      const result = await retryCleanup({
        data: {
          connectionRef: connection.connectionRef,
          commandId: crypto.randomUUID(),
        },
      })
      if (result.kind === 'refused') {
        setNotice({ kind: 'error', text: connectionRefusalCopy(result.code) })
        return
      }
      await refresh()
    } catch {
      setNotice({ kind: 'error', text: 'Provider cleanup could not be restarted. Try again.' })
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <AeSection
      title="Supplier connections"
      description="Connect a hosted x402 endpoint so Agentic Economy can route paid calls without collecting an API key or wallet secret. Then open an operation and select this connection as its access authority."
    >
      {connections.length === 0 ? (
        <AeEmptyState
          title="No provider connection yet"
          description="Add the public HTTPS endpoint that returns the x402 payment challenge for your operation."
        />
      ) : (
        <ul className="m-0 grid list-none divide-y divide-border border-y border-border p-0">
          {connections.map((connection) => (
            <li key={connection.connectionRef} className="grid min-w-0 gap-3 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <p className="font-medium text-foreground">{providerConnectionStatus(connection)}</p>
                  <p className="break-all text-sm text-muted-foreground">{connection.grantedResources[0] ?? connection.providerAccountRef}</p>
                </div>
                {(connection.lifecycle === 'active' || connection.lifecycle === 'reauthorization_required') ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="min-h-touch"
                      disabled={busy !== undefined}
                      onClick={() => void updateConnection('reconnect', connection)}
                    >
                      {connection.lifecycle === 'active' ? 'Refresh authority' : 'Reconnect'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-touch"
                      disabled={busy !== undefined}
                      onClick={() => void updateConnection('revoke', connection)}
                    >
                      Revoke
                    </Button>
                  </div>
                ) : connection.lifecycle === 'cleanup_required' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-touch"
                    disabled={busy !== undefined}
                    onClick={() => void retryConnectionCleanup(connection)}
                  >
                    Retry cleanup
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canConnect ? (
        <form className="grid gap-3" onSubmit={submitConnection}>
          <div className="grid gap-1.5">
            <label htmlFor="provider-x402-resource-url" className="text-sm font-medium text-foreground">x402 resource URL</label>
            <Input
              id="provider-x402-resource-url"
              name="resourceUrl"
              type="url"
              inputMode="url"
              autoComplete="url"
              maxLength={2_048}
              placeholder="https://api.example.com/paid-operation"
              value={resourceUrl}
              onChange={(event) => setResourceUrl(event.target.value)}
              aria-describedby="provider-x402-resource-url-hint"
              required
            />
            <p id="provider-x402-resource-url-hint" className="text-sm text-muted-foreground">Use the exact public route that returns HTTP 402 when called without payment.</p>
          </div>
          <Button type="submit" className="min-h-touch justify-self-start" disabled={busy !== undefined}>
            {busy === 'new' ? 'Connecting…' : 'Connect supplier'}
          </Button>
        </form>
      ) : (
        <AeEmptyState
          title="Supplier identity is required to connect"
          description="Review supplier setup, then return here to add an x402 endpoint."
          action={
            <Button asChild className="min-h-touch">
              <Link to="/for-providers">Review supplier setup</Link>
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
    </AeSection>
  )
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

function connectionRefusalCopy(code: string): string {
  if (code === 'connection_resource_conflict') return 'This x402 endpoint is already connected to another provider.'
  if (code === 'credential_resource_conflict') return 'This endpoint is already connected with a different authority method.'
  if (code === 'authentication_required' || code === 'authorization_denied') return 'Sign in as the provider owner and try again.'
  if (code === 'authority_conflict') return 'This connection changed in another session. Reload and try again.'
  if (code === 'invalid_resource') return 'Enter a public HTTPS x402 resource URL.'
  return 'The provider connection could not be updated. Reload and try again.'
}
