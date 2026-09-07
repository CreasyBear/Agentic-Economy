import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { z } from 'zod'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  cancelOwnerProviderConnectionAttemptServer,
  completeOwnerHttpProviderConnectionServer,
  readOwnerProviderConnectionAttemptServer,
  startOwnerMcpProviderConnectionServer,
  type OwnerProviderConnectionAttemptReadback,
} from '@/modules/capability-supply/supply-funnel.functions'

export const Route = createFileRoute('/_operator/owner/supply/connections/new')({
  ...operatorRouteOptions,
  validateSearch: z.object({
    attempt: z.string().trim().min(1).max(300).optional(),
  }),
  loaderDeps: ({ search }) => ({ attemptRef: search.attempt }),
  loader: async ({ deps }) => deps.attemptRef === undefined
    ? { kind: 'not_found' as const }
    : await readOwnerProviderConnectionAttemptServer({ data: { attemptRef: deps.attemptRef } }),
  head: () => ({ meta: [
    { title: 'Connect service | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: OwnerProviderConnectionHandoffRoute,
})

function OwnerProviderConnectionHandoffRoute() {
  const loaded = Route.useLoaderData()
  const completeRequest = useServerFn(completeOwnerHttpProviderConnectionServer)
  const complete = useReverification(completeRequest)
  const readAttempt = useServerFn(readOwnerProviderConnectionAttemptServer)
  const cancelRequest = useServerFn(cancelOwnerProviderConnectionAttemptServer)
  const cancel = useReverification(cancelRequest)
  const idempotencyKey = useRef<string | undefined>(undefined)
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function cancelAttempt(attempt: Extract<OwnerProviderConnectionAttemptReadback, { kind: 'available' }>['attempt']) {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await cancel({ data: { attemptRef: attempt.attemptRef, idempotencyKey: `cancel:${crypto.randomUUID()}` } })
      if (result.kind === 'refused') {
        setError('AE could not confirm cancellation. Reload this connection request before taking another action.')
        return
      }
      const draftRef = attempt.draftRef ?? attempt.candidateDraftRef
      window.location.assign(result.state === 'consumed' && attempt.connectionRef !== undefined
        ? connectionReturnUrl(attempt.connectionRef, attempt.environment, draftRef)
        : `/owner/offerings/new${draftRef === undefined ? '' : `?draft=${encodeURIComponent(draftRef)}`}`)
    } catch (cause) {
      if (!isReverificationCancelledError(cause)) {
        captureClientExceptionOnClient(cause)
        setError('AE could not confirm cancellation. Reload this connection request before taking another action.')
      }
    } finally { setBusy(false) }
  }

  if (loaded.kind !== 'available') {
    return (
      <Shell>
        <Alert>
          <AlertTitle>This connection request is unavailable</AlertTitle>
          <AlertDescription>
            <p>Return to Add service and start the connection again.</p>
            <ReturnToAddService />
          </AlertDescription>
        </Alert>
      </Shell>
    )
  }

  if (loaded.attempt.sourceKind === 'mcp_oauth') {
    return <McpOAuthHandoff attempt={loaded.attempt} onCancel={cancelAttempt} cancelBusy={busy} cancelError={error} />
  }

  if (loaded.attempt.state !== 'pending') {
    return (
      <Shell>
        {loaded.attempt.state === 'consumed' ? (
          <Alert>
            <AlertTitle>Service connected</AlertTitle>
          <AlertDescription>
            <p>Return to Add service. AE will resume the saved Tool draft.</p>
            <ReturnToAddService
              connectionRef={loaded.attempt.connectionRef}
              environment={loaded.attempt.environment}
              draftRef={loaded.attempt.draftRef ?? loaded.attempt.candidateDraftRef}
            />
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <AlertTitle>This connection request has expired</AlertTitle>
            <AlertDescription>
              <p>Return to Add service and start the connection again.</p>
              <ReturnToAddService draftRef={loaded.attempt.draftRef ?? loaded.attempt.candidateDraftRef} />
            </AlertDescription>
          </Alert>
        )}
      </Shell>
    )
  }

  const attempt = loaded.attempt
  idempotencyKey.current ??= `provider-http:${attempt.attemptRef}`
  const credentialLabel = attempt.authentication.kind === 'api_key'
    ? `${attempt.authentication.name} API key`
    : 'Bearer token'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || credential.length === 0) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await complete({ data: {
        attemptRef: attempt.attemptRef,
        credential,
        idempotencyKey: idempotencyKey.current,
      } })
      setCredential('')
      if (result.kind !== 'refused') {
        window.location.assign(connectionReturnUrl(
          result.connection.connectionRef,
          result.connection.sourceEnvironment ?? attempt.environment,
          attempt.draftRef ?? attempt.candidateDraftRef,
        ))
        return
      }
      setError(refusalCopy(result.code))
    } catch (cause) {
      setCredential('')
      if (!isReverificationCancelledError(cause)) {
        captureClientExceptionOnClient(cause)
        try {
          const readback = await readAttempt({ data: { attemptRef: attempt.attemptRef } })
          if (readback.kind === 'available' && readback.attempt.state === 'consumed' && readback.attempt.connectionRef !== undefined) {
            window.location.assign(connectionReturnUrl(readback.attempt.connectionRef, readback.attempt.environment, readback.attempt.draftRef ?? readback.attempt.candidateDraftRef))
            return
          }
          setError(readback.kind === 'available' && readback.attempt.state === 'pending'
            ? 'AE could not confirm whether the connection is still completing. Reload this request to check its status before submitting again.'
            : 'AE could not confirm the connection. Reload this request to check its current status.')
        } catch {
          setError('AE could not confirm the connection or read its current status. Reload this request before submitting again.')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form className="grid max-w-xl gap-5" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              Enter the credential for {attempt.sourceOrigin}. AE stores it in the Provider connection and will not show it again.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="provider-connection-credential">{credentialLabel}</Label>
            <Input
              id="provider-connection-credential"
              type="password"
              value={credential}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={32_768}
              disabled={busy}
              aria-describedby={error === undefined ? undefined : 'provider-connection-error'}
              aria-invalid={error === undefined ? undefined : true}
              onChange={(event) => setCredential(event.target.value)}
            />
          </div>
          {error === undefined ? null : (
            <Alert id="provider-connection-error" variant="destructive" role="alert">
              <AlertTitle>Service not connected</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || credential.length === 0}>
              {busy ? 'Connecting…' : 'Connect service'}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void cancelAttempt(attempt)}>Cancel</Button>
          </div>
      </form>
    </Shell>
  )
}

function McpOAuthHandoff({ attempt, onCancel, cancelBusy, cancelError }: Readonly<{
  attempt: Extract<OwnerProviderConnectionAttemptReadback, { kind: 'available' }>['attempt']
  onCancel: (attempt: Extract<OwnerProviderConnectionAttemptReadback, { kind: 'available' }>['attempt']) => Promise<void>
  cancelBusy: boolean
  cancelError?: string | undefined
}>) {
  const startRequest = useServerFn(startOwnerMcpProviderConnectionServer)
  const start = useReverification(startRequest)
  const idempotencyKey = useRef(`provider-mcp-oauth:${attempt.attemptRef}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  if (attempt.state !== 'pending') {
    return (
      <Shell>
        <Alert>
          <AlertTitle>{attempt.state === 'consumed' ? 'Service connected' : 'This connection request has expired'}</AlertTitle>
          <AlertDescription>
            <p>{attempt.state === 'consumed'
              ? 'Return to Add service. AE will resume with the connected source.'
              : 'Return to Add service and start the connection again.'}</p>
            <ReturnToAddService connectionRef={attempt.connectionRef} environment={attempt.environment} draftRef={attempt.draftRef ?? attempt.candidateDraftRef} />
          </AlertDescription>
        </Alert>
      </Shell>
    )
  }

  async function begin() {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await start({ data: {
        attemptRef: attempt.attemptRef,
        idempotencyKey: idempotencyKey.current,
      } })
      if (result.kind === 'redirect') {
        window.location.assign(result.authorizationUrl)
        return
      }
      setError(refusalCopy(result.code))
    } catch (cause) {
      if (!isReverificationCancelledError(cause)) {
        captureClientExceptionOnClient(cause)
        setError('AE could not start sign-in. Try again from this connection request.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <div className="grid max-w-xl gap-5">
        <p className="text-sm text-muted-foreground">
          Sign in to {attempt.sourceOrigin}. The Provider controls its consent screen; AE stores the resulting connection securely and returns you to Add service.
        </p>
        {(error ?? cancelError) === undefined ? null : (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Sign-in not started</AlertTitle>
            <AlertDescription>{error ?? cancelError}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={busy} onClick={() => void begin()}>
            {busy ? 'Opening sign-in…' : 'Continue to sign in'}
          </Button>
          <Button type="button" variant="secondary" disabled={busy || cancelBusy} onClick={() => void onCancel(attempt)}>Cancel</Button>
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Connect service"
      description="Connect the credential required by this Provider source."
      currentPath="/owner/offerings/new"
      breadcrumbs={[{ label: 'Tools', href: '/owner/offerings' }, { label: 'Add service', href: '/owner/offerings/new' }, { label: 'Connect service' }]}
    >
      <AeSettingsStack>{children}</AeSettingsStack>
    </AeOperatorShell>
  )
}

function connectionReturnUrl(connectionRef: string, environment: 'sandbox' | 'production', draftRef?: string): string {
  const search = new URLSearchParams({ connection: connectionRef, environment })
  if (draftRef !== undefined) search.set('draft', draftRef)
  return `/owner/offerings/new?${search.toString()}`
}

function ReturnToAddService({ connectionRef, environment, draftRef }: Readonly<{
  connectionRef?: string | undefined
  environment?: 'sandbox' | 'production' | undefined
  draftRef?: string | undefined
}> = {}) {
  const draftQuery = draftRef === undefined ? '' : `?draft=${encodeURIComponent(draftRef)}`
  return (
    <Button asChild variant="secondary" className="mt-4 min-h-touch">
      <a href={connectionRef === undefined || environment === undefined
        ? `/owner/offerings/new${draftQuery}`
        : connectionReturnUrl(connectionRef, environment, draftRef)}>Return to Add service</a>
    </Button>
  )
}

function refusalCopy(code: string): string {
  switch (code) {
    case 'attempt_expired':
    case 'not_found':
      return 'This connection request is no longer available. Return to Add service and start again.'
    case 'reauthentication_required':
      return 'Your confirmation expired. Submit once more to confirm this connection.'
    case 'secret_unavailable':
      return 'The credential could not be stored. Try again; no Provider connection was created.'
    case 'connection_conflict':
      return 'The Provider connection changed. Return to Add service and review the current connection.'
    default:
      return 'AE could not confirm the connection. Try again.'
  }
}
