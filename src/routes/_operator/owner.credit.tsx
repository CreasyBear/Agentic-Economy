import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import type { CreditTopupPort } from '@/components/ae/console/AeCreditTopUpPanel'
import { OwnerSettingsNav } from '@/components/ae/settings/OwnerSettingsSections'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAgentAccessConsoleServer } from '@/lib/server/agent-access-console.functions'
import type { AgentAccessConsoleReadback } from '@/modules/agent-access/agent-access-console'
import { beginCreditTopupServer, readCreditPaymentServer } from '@/modules/money/server'

export const Route = createFileRoute('/_operator/owner/credit')({
  ...operatorRouteOptions,
  head: () => ({
    meta: [
      { title: 'Credit | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerCreditRoute,
})

function OwnerCreditRoute() {
  const readConsole = useServerFn(readAgentAccessConsoleServer)
  const localE2E = isLocalE2EAuthBypassEnabled()
  const beginCreditTopup = useServerFn(beginCreditTopupServer)
  const readCreditPayment = useServerFn(readCreditPaymentServer)
  const creditTopupPort = useMemo<CreditTopupPort>(() => ({
    begin: (data) => beginCreditTopup({ data }),
    read: (data) => readCreditPayment({ data }),
  }), [beginCreditTopup, readCreditPayment])
  const [items, setItems] = useState<AgentAccessConsoleReadback>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await readConsole())
      setError(undefined)
    } catch {
      setError('Credit balance is temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [readConsole])

  useEffect(() => {
    if (localE2E) {
      setItems([])
      setError(undefined)
      setLoading(false)
      return
    }
    void load()
  }, [load, localE2E])

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Credit"
      description="Add credit, then keep it assigned to each agent that makes paid calls."
      currentPath="/owner/credit"
      actions={
        <Button asChild variant="secondary">
          <Link to="/agent-access">Open Keys</Link>
        </Button>
      }
    >
      <div className="grid gap-6">
        <OwnerSettingsNav current="credit" />
        {localE2E ? (
          <Alert>
            <AlertTitle>Local preview — credit is not connected</AlertTitle>
            <AlertDescription>
              <p>This browser journey does not sign in or add credit. Browse the public demo to explore the customer experience.</p>
              <Button asChild variant="secondary" className="mt-2 min-h-11"><Link to="/">Browse public demo</Link></Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Credit unavailable</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
                {loading ? 'Trying again…' : 'Try again'}
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <AeOwnerCredit
          items={items}
          loading={loading}
          creditTopupPort={creditTopupPort}
          onCreditRefresh={load}
        />
      </div>
    </AeOperatorShell>
  )
}
