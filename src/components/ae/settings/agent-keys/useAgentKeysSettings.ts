import { useCallback, useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import { readAgentDirectoryPageServer, readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { revokeAgentCredentialServer } from '@/modules/agent-access/agent-access.functions'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'

export function useAgentKeysSettings(initialDirectory: AgentDirectoryProjection) {
  const readDirectory = useServerFn(readAgentDirectoryServer)
  const readPage = useServerFn(readAgentDirectoryPageServer)
  const revokeKey = useServerFn(revokeAgentCredentialServer)
  const [directory, setDirectory] = useState(initialDirectory)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string>()
  const [refreshRequired, setRefreshRequired] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<{ ref: string; name: string }>()
  const [revoking, setRevoking] = useState(false)
  const revokeTriggerRef = useRef<HTMLButtonElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setDirectory(await readDirectory())
      setError(undefined)
      setRefreshRequired(false)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Agent keys could not be refreshed. Try again before changing another key.')
      setRefreshRequired(true)
    } finally {
      setLoading(false)
    }
  }, [readDirectory])

  const loadMore = useCallback(async () => {
    const cursor = directory.nextCursor
    if (cursor === undefined || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await readPage({ data: { cursor } })
      setDirectory((current) => {
        if (current.nextCursor !== cursor) return current
        const { nextCursor: _previousCursor, ...page } = current
        return {
          ...page,
          items: [...current.items, ...next.items],
          details: [...current.details, ...next.details],
          ...(next.nextCursor === undefined ? {} : { nextCursor: next.nextCursor }),
        }
      })
      if (!refreshRequired) setError(undefined)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('More Agent keys could not be loaded. Try again.')
    } finally {
      setLoadingMore(false)
    }
  }, [directory.nextCursor, loadingMore, readPage, refreshRequired])

  function requestRevoke(ref: string, name: string, trigger: HTMLButtonElement) {
    if (refreshRequired) return
    revokeTriggerRef.current = trigger
    setError(undefined)
    setRevokeTarget({ ref, name })
  }

  async function confirmRevoke() {
    if (revokeTarget === undefined || revoking || refreshRequired) return
    setRevoking(true)
    try {
      const result = await revokeKey({ data: { credentialRef: revokeTarget.ref } })
      if (result.kind !== 'completed' && result.kind !== 'replayed') {
        setError(result.kind === 'refused' && result.code === 'authentication_required'
          ? 'Sign in as the access owner before revoking this key.'
          : `Key revocation was not confirmed (${result.kind}). Refresh before trying again.`)
        setRefreshRequired(true)
        setRevokeTarget(undefined)
        return
      }
      setRevokeTarget(undefined)
      await refresh()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Key revocation was not confirmed. Refresh before trying again.')
      setRefreshRequired(true)
      setRevokeTarget(undefined)
    } finally {
      setRevoking(false)
    }
  }

  return {
    directory, loading, loadingMore, error, refreshRequired, revokeTarget, revoking, revokeTriggerRef,
    refresh, loadMore, requestRevoke, confirmRevoke,
    closeRevoke: (open: boolean) => { if (!open && !revoking) setRevokeTarget(undefined) },
  }
}
