import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeSecurityHistoryTable } from '@/components/ae/settings/AeSecurityHistoryTable'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  readAccountSecurityHistoryServer,
} from '@/modules/security/account-security.functions'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  appendAccountSecurityHistoryPage,
  type AccountSecurityHistoryResult,
} from '@/modules/security/account-security'
import { degrade } from '@/lib/observability/degrade'

export function AeAccountSecurityHistory({
  initialResult,
}: Readonly<{ initialResult: AccountSecurityHistoryResult }>) {
  return <AccountSecurityHistoryFrame key={canonicalDigest(initialResult)} initialResult={initialResult} />
}

function AccountSecurityHistoryFrame({
  initialResult,
}: Readonly<{ initialResult: AccountSecurityHistoryResult }>) {
  const readHistory = useServerFn(readAccountSecurityHistoryServer)
  const [result, setResult] = useState(initialResult)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = async (cursor: string | null) => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const next = await readHistory({ data: cursor === null ? {} : { cursor } })
      if (next.kind === 'available' && result.kind === 'available' && cursor !== null) {
        setResult({
          kind: 'available',
          page: {
            ...next.page,
            items: appendAccountSecurityHistoryPage(result.page, next.page).items,
          },
        })
      } else if (cursor !== null && result.kind === 'available') {
        setLoadFailed(true)
      } else {
        setResult(next)
      }
    } catch (cause) {
      const unavailable = degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
        site: 'loadAccountSecurityHistory',
        reason: 'source_unavailable',
      })
      if (cursor !== null && result.kind === 'available') setLoadFailed(true)
      else setResult(unavailable)
    } finally {
      setLoading(false)
    }
  }

  const rows = result.kind === 'available' ? result.page.items : []

  return (
    <AeSection
      id="security-history"
      title="Security history"
      description="Account-scoped session, security, agent, connection, and consequential-action evidence recorded since history activation."
    >
      {result.kind === 'unavailable' ? (
        <Alert variant="destructive">
          <AlertTitle>Security history unavailable</AlertTitle>
          <AlertDescription>
            <p>No newer security state is being claimed. Your Clerk profile and session controls remain available above.</p>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void load(null)}>
              {loading ? 'Trying again…' : 'Try again'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <AeSecurityHistoryTable
          rows={rows}
          caption="Account security history"
          emptyMessage="No security events have been recorded since history activation."
          isDone={result.page.isDone}
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={() => void load(result.page.continueCursor)}
        />
      )}
    </AeSection>
  )
}
