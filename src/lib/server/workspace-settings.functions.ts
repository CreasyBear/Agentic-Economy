import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { SOURCE_READ_TIMEOUT_MS, awaitBoundedRead } from '@/lib/bounded-read'
import { createAuthenticatedSourceTransport } from './convex-source'
import { readPersonalWorkspaceDefaultNameThroughSource } from './workspace-profile.functions'
import { readProviderWorkspaceIdentityDetailThroughSource, readProviderWorkspacePublicStatusThroughSource } from '@/components/ae/offerings/provider-workspace.functions'
import { degrade } from '@/lib/observability/degrade'

/** Same leaf owners and backend checks; one transport only for this request. */
export const readWorkspaceSettingsServer = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('cache-control', 'private, no-store')
  const requestSignal = getRequest().signal
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS)])
  const transport = await awaitBoundedRead(signal => createAuthenticatedSourceTransport({ signal }), signal)
  const unavailable = (cause: unknown) => {
    if (requestSignal.aborted) throw cause
    return degrade(cause, { kind: 'unavailable' } as const, {
      site: 'readWorkspaceSettingsServer', reason: 'source_unavailable',
    })
  }
  const [identity, status, defaultName] = await Promise.all([
    awaitBoundedRead(() => readProviderWorkspaceIdentityDetailThroughSource(transport), signal).catch(unavailable),
    awaitBoundedRead(() => readProviderWorkspacePublicStatusThroughSource(transport, signal), signal).catch(unavailable),
    // A failed default-name read still rejects the route; never invent a successful name.
    awaitBoundedRead(() => readPersonalWorkspaceDefaultNameThroughSource(transport, signal), signal),
  ])
  requestSignal.throwIfAborted()
  return { identity, status, defaultName }
})
