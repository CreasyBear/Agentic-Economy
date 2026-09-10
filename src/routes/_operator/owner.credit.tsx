import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import type { AccountFundingPort } from '@/components/ae/console/AeCreditTopUpPanel'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import {
  createOwnerStatementServer,
  createOwnerDailyCloseServer,
  readOwnerProviderObligationsServer,
  readOwnerMoneyDocumentsServer,
  readOwnerMoneyReconciliationServer,
  renderOwnerMoneyDocumentServer,
  signOwnerDailyCloseServer,
  type MoneyDocumentView,
  type MoneyProviderObligationView,
  type MoneyReconciliationCaseView,
} from '@/lib/server/money-documents.functions'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import {
  beginAccountFundingServer,
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
  const readDocuments = useServerFn(readOwnerMoneyDocumentsServer)
  const readReconciliation = useServerFn(readOwnerMoneyReconciliationServer)
  const readObligations = useServerFn(readOwnerProviderObligationsServer)
  const createStatement = useServerFn(createOwnerStatementServer)
  const createDailyClose = useServerFn(createOwnerDailyCloseServer)
  const signDailyClose = useServerFn(signOwnerDailyCloseServer)
  const renderDocument = useServerFn(renderOwnerMoneyDocumentServer)
  const accountFundingPort = useMemo<AccountFundingPort>(() => ({
    begin: (data) => beginAccountFunding({ data }),
    read: (data) => readAccountFunding({ data }),
  }), [beginAccountFunding, readAccountFunding])
  const [directory, setDirectory] = useState<AgentDirectoryProjection>(emptyAgentDirectory)
  const [documents, setDocuments] = useState<readonly MoneyDocumentView[]>([])
  const [reconciliationCases, setReconciliationCases] = useState<readonly MoneyReconciliationCaseView[]>([])
  const [providerObligations, setProviderObligations] = useState<readonly MoneyProviderObligationView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextDirectory, nextDocuments, nextReconciliation, nextObligations] = await Promise.all([
        readDirectory(),
        readDocuments({ data: {} }),
        readReconciliation({ data: {} }),
        readObligations({ data: {} }),
      ])
      setDirectory(nextDirectory)
      setDocuments(nextDocuments.page)
      setReconciliationCases(nextReconciliation.page)
      setProviderObligations(nextObligations.page)
      setError(undefined)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setError('Credit balance is temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [readDirectory, readDocuments, readObligations, readReconciliation])

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
    <AeOperatorPage
      operatorRole="owner"
      title="Funding"
      description="Fund the Account in AUD, then control each Agent's spending through its spending policy."
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
          loading={loading}
          accountFundingPort={accountFundingPort}
          onCreditRefresh={load}
          documents={documents}
          reconciliationCases={reconciliationCases}
          providerObligations={providerObligations}
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
                onCreateDailyClose: async () => {
                  const today = new Date()
                  const periodEnd = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
                  const periodStart = periodEnd - 24 * 60 * 60 * 1_000
                  const result = await createDailyClose({ data: { periodStart, periodEnd } })
                  if (result.kind === 'refused') throw new Error(result.code)
                  await load()
                },
                onSignDailyClose: async (documentRef: string, expectedRenderInputDigest: string) => {
                  const result = await signDailyClose({ data: { documentRef, expectedRenderInputDigest } })
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
    </AeOperatorPage>
  )
}

const emptyAgentDirectory: AgentDirectoryProjection = Object.freeze({
  items: Object.freeze([]),
  details: Object.freeze([]),
  accountBalance: Object.freeze({
    kind: 'available',
    accountRef: 'local-preview',
    balance: Object.freeze({ currency: 'AUD', units: '0', exponent: 6 }),
    locked: false,
    version: 0,
  } satisfies AccountFundingBalance),
})
