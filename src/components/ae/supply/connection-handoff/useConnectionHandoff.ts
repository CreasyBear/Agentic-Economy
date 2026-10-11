import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'

import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { degrade } from '@/lib/observability/degrade'
import {
  cancelOwnerProviderConnectionAttemptServer,
  completeOwnerHttpProviderConnectionServer,
  readOwnerProviderConnectionAttemptServer,
  startOwnerMcpProviderConnectionServer,
  type OwnerProviderConnectionAttemptReadback,
} from '@/modules/capability-supply/supply-funnel.functions'

import {
  buildHandoffReturnSearch,
  refusalCopy,
  type AeConnectionHandoffProps,
  type ConnectionHandoffSurface,
} from './connection-handoff.contracts'

type AvailableAttempt = Extract<OwnerProviderConnectionAttemptReadback, { kind: 'available' }>['attempt']

export function useConnectionHandoff({ loaded }: AeConnectionHandoffProps) {
  const navigate = useNavigate()
  const completeRequest = useServerFn(completeOwnerHttpProviderConnectionServer)
  const complete = useReverification(completeRequest)
  const readAttempt = useServerFn(readOwnerProviderConnectionAttemptServer)
  const cancelRequest = useServerFn(cancelOwnerProviderConnectionAttemptServer)
  const cancel = useReverification(cancelRequest)
  const startRequest = useServerFn(startOwnerMcpProviderConnectionServer)
  const start = useReverification(startRequest)

  const httpIdempotencyKeyRef = useRef(
    loaded.kind === 'available'
      && loaded.attempt.sourceKind !== 'mcp_oauth'
      && loaded.attempt.state === 'pending'
      ? `provider-http:${loaded.attempt.attemptRef}`
      : undefined,
  )
  const mcpIdempotencyKeyRef = useRef(
    loaded.kind === 'available'
      && loaded.attempt.sourceKind === 'mcp_oauth'
      && loaded.attempt.state === 'pending'
      ? `provider-mcp-oauth:${loaded.attempt.attemptRef}`
      : undefined,
  )
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState(false)
  const [mcpBeginBusy, setMcpBeginBusy] = useState(false)
  const [cancelError, setCancelError] = useState<string>()
  const [httpError, setHttpError] = useState<string>()
  const [mcpError, setMcpError] = useState<string>()

  async function cancelAttempt(attempt: AvailableAttempt) {
    if (busy) return
    setBusy(true)
    setCancelError(undefined)
    try {
      const result = await cancel({ data: { attemptRef: attempt.attemptRef, idempotencyKey: `cancel:${crypto.randomUUID()}` } })
      if (result.kind === 'refused') {
        setCancelError('Agentic Economy could not confirm cancellation. Reload this connection request before taking another action.')
        return
      }
      const draftRef = attempt.draftRef ?? attempt.candidateDraftRef
      void navigate({ to: '/owner/operations/new', search: result.state === 'consumed' && attempt.connectionRef !== undefined
        ? { connection: attempt.connectionRef, environment: attempt.environment, ...(draftRef === undefined ? {} : { draft: draftRef }) }
        : (draftRef === undefined ? {} : { draft: draftRef }) })
    } catch (cause) {
      if (!isReverificationCancelledError(cause)) {
        captureClientExceptionOnClient(cause)
        setCancelError('Agentic Economy could not confirm cancellation. Reload this connection request before taking another action.')
      }
    } finally { setBusy(false) }
  }

  async function submitHttp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loaded.kind !== 'available' || loaded.attempt.state !== 'pending' || loaded.attempt.sourceKind === 'mcp_oauth') return
    const attempt = loaded.attempt
    if (busy) return
    if (credential.length === 0) {
      setHttpError('Enter the credential before connecting.')
      document.getElementById('provider-connection-credential')?.focus()
      return
    }
    httpIdempotencyKeyRef.current ??= `provider-http:${attempt.attemptRef}`
    setBusy(true)
    setHttpError(undefined)
    try {
      const result = await complete({ data: {
        attemptRef: attempt.attemptRef,
        credential,
        idempotencyKey: httpIdempotencyKeyRef.current,
      } })
      setCredential('')
      if (result.kind !== 'refused') {
        const draftRef = attempt.draftRef ?? attempt.candidateDraftRef
        void navigate({ to: '/owner/operations/new', search: {
          connection: result.connection.connectionRef,
          environment: result.connection.sourceEnvironment ?? attempt.environment,
          ...(draftRef === undefined ? {} : { draft: draftRef }),
        } })
        return
      }
      setHttpError(refusalCopy(result.code))
    } catch (cause) {
      setCredential('')
      if (!isReverificationCancelledError(cause)) {
        captureClientExceptionOnClient(cause)
        try {
          const readback = await readAttempt({ data: { attemptRef: attempt.attemptRef } })
          if (readback.kind === 'available' && readback.attempt.state === 'consumed' && readback.attempt.connectionRef !== undefined) {
            const readbackDraftRef = readback.attempt.draftRef ?? readback.attempt.candidateDraftRef
            void navigate({ to: '/owner/operations/new', search: {
              connection: readback.attempt.connectionRef,
              environment: readback.attempt.environment,
              ...(readbackDraftRef === undefined ? {} : { draft: readbackDraftRef }),
            } })
            return
          }
          setHttpError(readback.kind === 'available' && readback.attempt.state === 'pending'
            ? 'Agentic Economy could not confirm whether the connection is still completing. Reload this request to check its status before submitting again.'
            : 'Agentic Economy could not confirm the connection. Reload this request to check its current status.')
        } catch (readbackCause) {
          setHttpError(degrade(
            readbackCause,
            'Agentic Economy could not confirm the connection or read its current status. Reload this request before submitting again.',
            { site: 'ownerProviderConnectionReadbackRetry', reason: 'source_unavailable' },
          ))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const surface = projectSurface(loaded, {
    credential,
    busy,
    mcpBeginBusy,
    cancelError,
    httpError,
    mcpError,
  })

  const pendingAttempt = loaded.kind === 'available' ? loaded.attempt : undefined

  async function beginMcpOAuth() {
    if (loaded.kind !== 'available' || loaded.attempt.sourceKind !== 'mcp_oauth' || loaded.attempt.state !== 'pending') return
    const attempt = loaded.attempt
    if (mcpBeginBusy) return
    mcpIdempotencyKeyRef.current ??= `provider-mcp-oauth:${attempt.attemptRef}`
    setMcpBeginBusy(true)
    setMcpError(undefined)
    try {
      const result = await start({ data: {
        attemptRef: attempt.attemptRef,
        idempotencyKey: mcpIdempotencyKeyRef.current,
      } })
      if (result.kind === 'redirect') {
        if (!/^https:\/\//i.test(result.authorizationUrl) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(result.authorizationUrl)) {
          setMcpError('Agentic Economy could not start sign in. The provider returned an unsafe sign-in address.')
          return
        }
        window.location.assign(result.authorizationUrl)
        return
      }
      setMcpError(refusalCopy(result.code))
    } catch (cause) {
      if (!isReverificationCancelledError(cause)) {
        captureClientExceptionOnClient(cause)
        setMcpError('Agentic Economy could not start sign in. Try again from this connection request.')
      }
    } finally {
      setMcpBeginBusy(false)
    }
  }

  function handleCancel() {
    if (pendingAttempt === undefined) return
    void cancelAttempt(pendingAttempt)
  }

  return {
    surface,
    setCredential,
    submitHttp,
    beginMcpOAuth,
    handleCancel,
  }
}

function projectSurface(
  loaded: OwnerProviderConnectionAttemptReadback,
  state: Readonly<{
    credential: string
    busy: boolean
    mcpBeginBusy: boolean
    cancelError: string | undefined
    httpError: string | undefined
    mcpError: string | undefined
  }>,
): ConnectionHandoffSurface {
  if (loaded.kind !== 'available') {
    return { kind: 'unavailable' }
  }

  const attempt = loaded.attempt
  const draftRef = attempt.draftRef ?? attempt.candidateDraftRef
  const returnSearch = buildHandoffReturnSearch({
    connectionRef: attempt.connectionRef,
    environment: attempt.environment,
    draftRef,
  })

  if (attempt.sourceKind === 'mcp_oauth') {
    if (attempt.state !== 'pending') {
      if (attempt.state === 'consumed') {
        return {
          kind: 'consumed',
          title: 'Provider connected',
          description: 'Return to Add Tool. Agentic Economy will resume with the connected source.',
          returnSearch,
        }
      }
      return { kind: 'expired', returnSearch }
    }
    const panelError = state.mcpError ?? state.cancelError
    return {
      kind: 'mcp_pending',
      sourceOriginLabel: attempt.sourceOrigin,
      beginBusy: state.mcpBeginBusy,
      cancelBusy: state.busy,
      error: panelError,
    }
  }

  if (attempt.state !== 'pending') {
    if (attempt.state === 'consumed') {
      return {
        kind: 'consumed',
        title: 'Provider connected',
        description: 'Return to Add Tool. Agentic Economy will resume the saved Tool draft.',
        returnSearch,
      }
    }
    return { kind: 'expired', returnSearch }
  }

  const credentialLabel = attempt.authentication.kind === 'api_key'
    ? `${attempt.authentication.name} API key`
    : 'Bearer token'

  return {
    kind: 'http_pending',
    sourceOriginLabel: attempt.sourceOrigin,
    credentialLabel,
    credential: state.credential,
    busy: state.busy,
    error: state.httpError ?? state.cancelError,
  }
}
