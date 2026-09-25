import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { CreditAccountingPanel } from './components/CreditAccountingPanel'
import { CreditFundPanel } from './components/CreditFundPanel'
import { CreditLedgerPanel } from './components/CreditLedgerPanel'
import {
  ownerCreditSectionNavigation,
  type AeOwnerCreditProps,
  type OwnerCreditSectionId,
} from './owner-credit.contracts'

function sectionFromHash(hash: string): OwnerCreditSectionId {
  const id = hash.startsWith('#') ? hash.slice(1) : hash
  const match = ownerCreditSectionNavigation.find((section) => section.id === id)
  return match?.id ?? 'fund'
}

export function AeOwnerCredit(props: AeOwnerCreditProps) {
  const reconciliationCases = props.reconciliationCases ?? []
  const openReconciliation = reconciliationCases.filter((item) => item.status === 'open').length
  const defaultSection = sectionFromHash(typeof window === 'undefined' ? '' : window.location.hash)

  return (
    <div className="grid gap-section">
      {openReconciliation > 0 ? (
        <Alert>
          <AlertTitle>Reconciliation needs attention</AlertTitle>
          <AlertDescription>
            {openReconciliation} open difference(s) may limit paid Calls. Details are available below.
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs defaultValue={defaultSection} className="gap-section">
        <TabsList
          variant="line"
          aria-label="Credit sections"
          className="max-w-full justify-start overflow-x-auto"
        >
          {ownerCreditSectionNavigation.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>{label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="fund">
          <CreditFundPanel {...props} />
        </TabsContent>
        <TabsContent value="ledger">
          <CreditLedgerPanel {...props} />
        </TabsContent>
      </Tabs>
      <details className="rounded-card border border-border p-gutter">
        <summary className="cursor-pointer font-medium">Accounting records and administration</summary>
        <div className="mt-related">
          <CreditAccountingPanel {...props} />
        </div>
      </details>
    </div>
  )
}
