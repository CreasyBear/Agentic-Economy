import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import type { AccountFundingPort } from '@/components/ae/console/AeCreditTopUpPanel'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import {
  createOwnerStatementServer,
  readOwnerMoneyDocumentsServer,
  readOwnerMoneyReconciliationServer,
  renderOwnerMoneyDocumentServer,
  type MoneyDocumentView,
  type MoneyReconciliationCaseView,
} from '@/lib/server/money-documents.functions'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import {
  beginAccountFundingServer,
  readAccountFundingBalanceServer,
  readAccountFundingServer,
} from '@/modules/money/money.functions'
import type { AccountFundingBalance } from '@/modules/money/server'

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
  const beginAccountFunding = useServerFn(beginAccountFundingServer)
  const readAccountFunding = useServerFn(readAccountFundingServer)
  const readAccountBalance = useServerFn(readAccountFundingBalanceServer)
  const readDocuments = useServerFn(readOwnerMoneyDocumentsServer)
  const readReconciliation = useServerFn(readOwnerMoneyReconciliationServer)
  const createStatement = useServerFn(createOwnerStatementServer)
  const renderDocument = useServerFn(renderOwnerMoneyDocumentServer)
  const accountFundingPort = useMemo<AccountFundingPort>(() => ({
    begin: (data) => beginAccountFunding({ data }),
    read: (data) => readAccountFunding({ data }),
  }), [beginAccountFunding, readAccountFunding])
  const [directory, setDirectory] = useState<AgentDirectoryProjection>(emptyAgentDirectory)
  const [accountBalance, setAccountBalance] = useState<AccountFundingBalance>(emptyAccountBalance)
  const [documents, setDocuments] = useState<readonly MoneyDocumentView[]>([])
  const [reconciliationCases, setReconciliationCases] = useState<readonly MoneyReconciliationCaseView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextDirectory, nextBalance, nextDocuments, nextReconciliation] = await Promise.all([
        readDirectory(),
        readAccountBalance(),
        readDocuments({ data: {} }),
        readReconciliation({ data: {} }),
      ])
      setDirectory(nextDirectory)
      setAccountBalance(nextBalance)
      setDocuments(nextDocuments.page)
      setReconciliationCases(nextReconciliation.page)
      setError(undefined)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Credit balance is temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [readAccountBalance, readDirectory, readDocuments, readReconciliation])

  useEffect(() => {
    if (localE2E) {
      setDirectory(emptyAgentDirectory)
      setAccountBalance(emptyAccountBalance)
      setError(undefined)
      setLoading(false)
      return
    }
    void load()
  }, [load, localE2E])

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Funding"
      description="Fund the Account in AUD, then control each Agent's spending through its durable budget."
      currentPath="/owner/credit"
      actions={
        <Button asChild variant="secondary">
          <Link to="/agent-access">Open Agents</Link>
        </Button>
      }
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
          accountBalance={accountBalance}
          loading={loading}
          accountFundingPort={accountFundingPort}
          onCreditRefresh={load}
          documents={documents}
          reconciliationCases={reconciliationCases}
          {...(localE2E
            ? {}
            : {
                onCreateStatement: async () => {
                  const now = new Date()
                  const periodStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
                  const periodEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
                  const result = await createStatement({ data: { periodStart, periodEnd } })
                  if (result.kind === 'refused') throw new Error(result.code)
                  await load()
                },
                onOpenDocument: async (documentRef: string) => {
                  const url = await renderDocument({ data: { documentRef } })
                  if (url === null) throw new Error('money_document_url_unavailable')
                  window.open(url, '_blank', 'noopener,noreferrer')
                },
              })}
        />
      </AeSettingsStack>
    </AeOperatorShell>
  )
}

const emptyAgentDirectory: AgentDirectoryProjection = Object.freeze({
  items: Object.freeze([]),
  details: Object.freeze([]),
})

const emptyAccountBalance: AccountFundingBalance = Object.freeze({
  kind: 'available',
  accountRef: 'local-preview',
  balance: Object.freeze({ currency: 'AUD', units: '0', exponent: 6 }),
  locked: false,
  version: 0,
})
