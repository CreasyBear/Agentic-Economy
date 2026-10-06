import { useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import { AeSecurityHistoryTable } from '@/components/ae/settings/AeSecurityHistoryTable'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { readAgentSecurityHistoryServer } from '@/modules/security/account-security.functions'
import {
  appendAccountSecurityHistoryPage,
  emptyAccountSecurityHistory,
  type AccountSecurityHistoryResult,
} from '@/modules/security/account-security'
import { degrade } from '@/lib/observability/degrade'
import './home/AgentHomeComposition.css'

export function AeAgentSecurityHistory({ principalRef }: Readonly<{ principalRef: string }>) {
  return <AgentSecurityHistoryFrame key={principalRef} principalRef={principalRef} />
}

function AgentSecurityHistoryFrame({ principalRef }: Readonly<{ principalRef: string }>) {
  const readHistory = useServerFn(readAgentSecurityHistoryServer)
  const [result, setResult] = useState<AccountSecurityHistoryResult>({
    kind: 'available',
    page: emptyAccountSecurityHistory(),
  })
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [retryGeneration, setRetryGeneration] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadFailed(false)
    setResult({ kind: 'available', page: emptyAccountSecurityHistory() })
    void readHistory({ data: { principalRef } })
      .then((next) => {
        if (active) setResult(next)
      })
      .catch((cause) => {
        const unavailable = degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
          site: 'loadAgentSecurityHistory',
          reason: 'source_unavailable',
        })
        if (active) setResult(unavailable)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [principalRef, readHistory, retryGeneration])

  async function loadMore() {
    if (loading || result.kind !== 'available' || result.page.isDone) return
    const currentPage = result.page
    setLoading(true)
    setLoadFailed(false)
    try {
      const next = await readHistory({ data: { principalRef, cursor: currentPage.continueCursor } })
      if (next.kind !== 'available') {
        setLoadFailed(true)
        return
      }
      setResult((current) => current.kind === 'available' && current.page === currentPage
        ? { kind: 'available', page: appendAccountSecurityHistoryPage(current.page, next.page) }
        : current)
    } catch (cause) {
      degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
        site: 'loadAgentSecurityHistoryContinuation',
        reason: 'source_unavailable',
      })
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  if (result.kind === 'unavailable') {
    return (
      <AeAlert tone="danger" title="Agent history unavailable" className="arc-market arc-agent-recovery">
          <p>No newer Agent state is being claimed. Credential and connection state above remains authoritative.</p>
          <Button type="button" variant="secondary" disabled={loading} onClick={() => setRetryGeneration((current) => current + 1)}>
            {loading ? 'Trying again…' : 'Try again'}
          </Button>
        </AeAlert>
    )
  }

  return (
    <AeSecurityHistoryTable
      rows={result.page.items}
      caption="Agent security history"
      emptyMessage={loading ? 'Loading Agent history…' : 'No Agent security events have been recorded since history activation.'}
      isDone={result.page.isDone}
      loading={loading}
      loadFailed={loadFailed}
      onLoadMore={() => void loadMore()}
      showActorAndTarget={false}
    />
  )
}
