import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/Tabs'

import './CreditComposition.css'

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
    <div className="arc-market arc-credit-root">
      {openReconciliation > 0 ? (
        <Alert>
          <AlertTitle>Reconciliation needs attention</AlertTitle>
          <AlertDescription>
            {openReconciliation} open difference(s) may limit paid Calls. Details are available below.
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs defaultValue={defaultSection} animateContent={false} className="arc-credit-tabs">
        <TabsList
          aria-label="Credit sections"
          className="arc-credit-tabs__list"
        >
          {ownerCreditSectionNavigation.map(({ id, label }) => (
            <TabsTrigger key={id} value={id} className="arc-credit-tabs__trigger">{label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="fund" className="arc-credit-tabs__content">
          <CreditFundPanel {...props} />
        </TabsContent>
        <TabsContent value="ledger" className="arc-credit-tabs__content">
          <CreditLedgerPanel {...props} />
        </TabsContent>
      </Tabs>
      <details className="arc-credit-accounting">
        <summary>Accounting records and administration</summary>
        <div className="arc-credit-accounting__content">
          <CreditAccountingPanel {...props} />
        </div>
      </details>
    </div>
  )
}
