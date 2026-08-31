import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import type { CreditTopupPort } from '@/components/ae/console/AeCreditTopUpPanel'
import { OwnerSettingsNav } from '@/components/ae/settings/OwnerSettingsSections'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
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
  const readDirectory = useServerFn(readAgentDirectoryServer)
  const localE2E = isLocalE2EAuthBypassEnabled()
  const beginCreditTopup = useServerFn(beginCreditTopupServer)
  const readCreditPayment = useServerFn(readCreditPaymentServer)
  const creditTopupPort = useMemo<CreditTopupPort>(() => ({
    begin: (data) => beginCreditTopup({ data }),
    read: (data) => readCreditPayment({ data }),
  }), [beginCreditTopup, readCreditPayment])
  const [directory, setDirectory] = useState<AgentDirectoryProjection>(emptyAgentDirectory)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDirectory(await readDirectory())
      setError(undefined)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Credit balance is temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [readDirectory])

  useEffect(() => {
    if (localE2E) {
      setDirectory(emptyAgentDirectory)
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
      secondaryBar={<OwnerSettingsNav current="credit" />}
    >
      <AeSettingsStack>
        {localE2E ? (
          <Alert>
            <AlertTitle>Local preview — credit is not connected</AlertTitle>
            <AlertDescription>
              <p>This browser journey does not sign in or add credit. Browse the public demo to explore the customer experience.</p>
              <Button asChild variant="secondary" className="mt-2 min-h-touch"><Link to="/">Browse public demo</Link></Button>
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
          directory={directory}
          loading={loading}
          creditTopupPort={creditTopupPort}
          onCreditRefresh={load}
        />
      </AeSettingsStack>
    </AeOperatorShell>
  )
}

const emptyAgentDirectory: AgentDirectoryProjection = Object.freeze({
  items: Object.freeze([]),
  details: Object.freeze([]),
})
