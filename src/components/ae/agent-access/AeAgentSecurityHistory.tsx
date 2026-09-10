import { useCallback, useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import { AeSecurityHistoryTable } from '@/components/ae/settings/AeSecurityHistoryTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { readAgentSecurityHistoryServer } from '@/modules/security/account-security.functions'
import {
  emptyAccountSecurityHistory,
  type AccountSecurityHistoryResult,
} from '@/modules/security/account-security'

export function AeAgentSecurityHistory({ principalRef }: Readonly<{ principalRef: string }>) {
  const readHistory = useServerFn(readAgentSecurityHistoryServer)
  const [result, setResult] = useState<AccountSecurityHistoryResult>({
    kind: 'available',
    page: emptyAccountSecurityHistory(),
  })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (cursor: string | null, append: boolean) => {
    setLoading(true)
    try {
      const next = await readHistory({ data: { principalRef, ...(cursor === null ? {} : { cursor }) } })
      setResult((current) => next.kind === 'available' && current.kind === 'available' && append
        ? { kind: 'available', page: { ...next.page, items: [...current.page.items, ...next.page.items] } }
        : next)
    } catch {
      setResult({ kind: 'unavailable', reason: 'source_unavailable' })
    } finally {
      setLoading(false)
    }
  }, [principalRef, readHistory])

  useEffect(() => {
    setResult({ kind: 'available', page: emptyAccountSecurityHistory() })
    void load(null, false)
  }, [load])

  if (result.kind === 'unavailable') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Agent history unavailable</AlertTitle>
        <AlertDescription>
          <p>No newer Agent state is being claimed. Credential and connection state above remains authoritative.</p>
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void load(null, false)}>
            {loading ? 'Trying again…' : 'Try again'}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <AeSecurityHistoryTable
      rows={result.page.items}
      caption="Agent security history"
      emptyMessage={loading ? 'Loading Agent history…' : 'No Agent security events have been recorded since history activation.'}
      isDone={result.page.isDone}
      loading={loading}
      onLoadMore={() => void load(result.page.continueCursor, true)}
      showActorAndTarget={false}
    />
  )
}
