import { useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import { SettingsGroup } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { AeSecurityHistoryTable } from '@/components/ae/settings/AeSecurityHistoryTable'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import {
  readAccountSecurityHistoryServer,
} from '@/modules/security/account-security.functions'
import {
  appendAccountSecurityHistoryPage,
  type AccountSecurityHistoryResult,
} from '@/modules/security/account-security'
import { degrade } from '@/lib/observability/degrade'
import type { AccountSecurityHistoryState, AeAccountSecurityHistoryProps } from './owner-settings.contracts'

function initialSecurityHistoryState(source: AccountSecurityHistoryResult): AccountSecurityHistoryState {
  return { source, result: source, status: 'idle' }
}

export function AeAccountSecurityHistory({ initialResult }: AeAccountSecurityHistoryProps) {
  const readHistory = useServerFn(readAccountSecurityHistoryServer)
  const [state, setState] = useState(() => initialSecurityHistoryState(initialResult))

  if (state.source !== initialResult) {
    setState(initialSecurityHistoryState(initialResult))
  }

  const current = state.source === initialResult ? state : initialSecurityHistoryState(initialResult)

  const load = async (cursor: string | null) => {
    const source = current.source
    const requestMatches = (candidate: AccountSecurityHistoryState) => candidate.source === source
      && (cursor === null
        || (candidate.result.kind === 'available' && candidate.result.page.continueCursor === cursor))

    setState((candidate) => requestMatches(candidate)
      ? { ...candidate, status: 'loading' }
      : candidate)
    try {
      const next = await readHistory({ data: cursor === null ? {} : { cursor } })
      setState((candidate) => {
        if (!requestMatches(candidate)) return candidate
        if (cursor === null) return { source, result: next, status: 'idle' }
        if (candidate.result.kind !== 'available' || next.kind !== 'available') {
          return { ...candidate, status: 'failed' }
        }
        return {
          source,
          result: {
            kind: 'available',
            page: {
              ...next.page,
              items: appendAccountSecurityHistoryPage(candidate.result.page, next.page).items,
            },
          },
          status: 'idle',
        }
      })
    } catch (cause) {
      const unavailable = degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
        site: 'loadAccountSecurityHistory',
        reason: 'source_unavailable',
      })
      setState((candidate) => {
        if (!requestMatches(candidate)) return candidate
        return cursor !== null && candidate.result.kind === 'available'
          ? { ...candidate, status: 'failed' }
          : { source, result: unavailable, status: 'idle' }
      })
    }
  }

  const result = current.result
  const loading = current.status === 'loading'
  const rows = result.kind === 'available' ? result.page.items : []

  return (
    <SettingsGroup
      title="Recorded activity"
      description="Observed session, Agent, connection and account actions. Filter or load older events below."
    >
      {result.kind === 'unavailable' ? (
        <AeAlert tone="danger" title="Security history is temporarily unavailable." className="arc-market"><div className="grid gap-1">
            <p>
              <strong>What happened:</strong> Security history is temporarily unavailable.
            </p>
            <p className="font-mono text-xs tabular-nums">
              <strong>Financial impact:</strong> A$0.00 affected — Profile, sessions, and Recovery stay available.
            </p>
            <p>
              <strong>Next step:</strong> Check your connection and try again.
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              size="md"
              aria-busy={loading || undefined}
              className="mt-4 justify-self-start"
              onClick={() => void load(null)}
            >
              {loading ? 'Trying again…' : 'Try again'}
            </Button>
          </div></AeAlert>
      ) : (
        <AeSecurityHistoryTable
          rows={rows}
          caption="Account security history"
          emptyMessage="No security events have been recorded since history activation."
          isDone={result.page.isDone}
          loading={loading}
          loadFailed={current.status === 'failed'}
          onLoadMore={() => void load(result.page.continueCursor)}
        />
      )}
    </SettingsGroup>
  )
}
