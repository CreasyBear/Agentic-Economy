import type { AdminCommandRequest } from '../actions/actions.contracts'
import { SettingsPageGroup } from '@/components/arc/blocks/settings-page/settings-page'
import { SortableDataTable } from '@/components/arc/sortable-data-table/sortable-data-table'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { POLICY_LABELS, policyDecimal } from './commercial-policy-form'

type Term = readonly [label: string, value: string]
type TermRow = { label: string; value: string }
type ReviewInput = Readonly<Extract<AdminCommandRequest, { action: 'change_commercial_policy' }>['input']>
type ReviewControl = ReviewInput['control']
function controlTerms(control: ReviewControl): { business: Term[]; technical: Term[] } {
  const money = (units: string, currency = 'AUD') => `${currency} ${policyDecimal(units)}`
  const percent = (bps: number) => `${policyDecimal(String(bps), 2)}%`
  switch (control.family) {
    case 'commercial_perimeter': return { business: [['Seller model', 'Agentic Economy as principal reseller'], ['Customer segment', 'Businesses only'], ['Customer crypto entitlement', 'None']], technical: [] }
    case 'tax': return { business: [['Tax on credit funding (funded amount plus service fee)', percent(control.serviceFeeTaxBps)], ['Tax on Calls', control.callTaxBps === undefined ? 'Unspecified' : percent(control.callTaxBps)], ['Tax invoice issuance', control.taxInvoiceIssuance === 'enabled' ? 'Enabled' : 'Disabled pending approval']], technical: [] }
    case 'accounting_client_money': return { business: [['Minimum funding', money(control.minimumFundingPrincipalUnits)], ['Maximum funding', money(control.maximumFundingPrincipalUnits)], ['Funding increment', money(control.fundingIncrementUnits)], ['Customer accessible limit', money(control.legalCustomerMaximumAccessibleUnits)], ['Balance classification', 'Customer contract liability']], technical: [] }
    case 'privacy_retention': return { business: [['Evidence retention', `${control.evidenceRetentionDays} days`], ['Legal hold', 'Supported (owner attestation)']], technical: [] }
    case 'treasury_custody': return { business: [['Minimum treasury buffer', money(control.minimumBufferUnits, 'USDC')], ['Deployment', control.deploymentClass === 'real_money' ? 'Real money (owner attestation)' : control.deploymentClass], ['PostgreSQL protection', control.postgresProtection === 'managed_pitr' ? 'Managed point-in-time recovery (owner attestation)' : 'Disposable fixture'], ['Recovery point objective', `${control.recoveryPointObjectiveMinutes} minutes`], ['Recovery time objective', `${control.recoveryTimeObjectiveMinutes} minutes`]], technical: [['Treasury asset', control.treasuryAsset], ['Treasury decimal places', String(control.treasuryExponent)], ['Ledger authority', 'Formance Community'], ['Ledger version', control.formanceLedgerVersion], ['Gateway version', control.formanceGatewayVersion], ['Schema version', control.formanceSchemaVersion], ['Maximum SDK integer units', control.maximumSdkIntegerUnits], ['Architecture review cumulative units', control.architectureReviewCumulativeUnits]] }
    case 'operations': return { business: [['Funding service fee', percent(control.fundingServiceFeeBps)], ['Buyer pricing margin', percent(control.buyerPricingMarginBps)], ['Commitment lifetime', `${control.commitmentTtlMs / 1_000} seconds`], ['Paid Call reports per day', control.paidCallReportsPerDay === undefined ? 'Default (3)' : String(control.paidCallReportsPerDay)], ['Backup', control.backupControl === 'postgres_pitr' ? 'PostgreSQL point-in-time recovery (owner attestation)' : 'Disposable fixture'], ['Restore', control.restoreControl === 'production_rehearsed' ? 'Production restore rehearsed (owner attestation)' : 'Disposable restore rehearsed'], ['Daily close', control.dailyCloseControl === 'human_signed' ? 'Human signed (owner attestation)' : 'Not required for fixture']], technical: [['SDK version', control.formanceSdkVersion], ['SDK artifact digest', control.formanceSdkArtifactDigest]] }
  }
}
function TermsTable({ terms, caption }: { terms: readonly Term[]; caption: string }) {
  const rows: TermRow[] = terms.map(([label, value]) => ({ label, value }))
  return <SortableDataTable
    rows={rows}
    rowKey="label"
    caption={caption}
    columns={[
      { key: 'label', label: 'Term', width: '45%', sortable: false },
      { key: 'value', label: 'Recorded value', width: '55%', sortable: false, render: (_value, row) => <span className="break-all whitespace-normal">{row.value}</span> },
    ]}
  />
}
export function CommercialPolicyControlReview({ control }: { control: ReviewControl }) {
  const terms = controlTerms(control)
  return <div className="grid gap-related"><TermsTable terms={terms.business} caption="Business policy terms" />{terms.technical.length === 0 ? null : <details><summary className="cursor-pointer text-sm">Technical requirements (read only)</summary><div className="mt-2"><TermsTable terms={terms.technical} caption="Technical requirements" /></div></details>}</div>
}
/** Both first-owner review and second approval render the exact command, without a live policy lookup. */
export function CommercialPolicyReview({ input }: { input: ReviewInput }) {
  return <section aria-label="Commercial policy terms" className="grid gap-related">
    <SettingsPageGroup title={POLICY_LABELS[input.family]} headingLevel={3}>
      <div className="grid gap-related">
        <TermsTable terms={[
          ['Change', input.changeKind === 'activate' ? 'Activate a new policy' : input.changeKind === 'replace' ? 'Replace active policy' : 'Suspend active policy'],
          ['Environment', input.environment], ['Revision', String(input.revision)], ['Policy reference', input.policyRef],
          ...(input.expectedCurrentPolicyRef === undefined ? [] : [['Current policy reference', input.expectedCurrentPolicyRef] as const]),
          ['Effective', `${formatPerthTimestamp(input.effectiveAt)} Perth time`], ['Expires', `${formatPerthTimestamp(input.expiresAt)} Perth time`],
        ]} caption="Policy change details" />
        <CommercialPolicyControlReview control={input.control} />
        {input.control.family === 'treasury_custody' ? <p className="text-sm text-muted-foreground">The recorded minimum must not exceed the current custody maximum. A higher floor requires changing custody configuration before approval; later cap drift blocks production admission.</p> : null}
        {input.changeKind === 'suspend' ? <p className="text-sm">Suspension stops admission under this policy. The recorded terms remain unchanged.</p> : <p className="text-sm text-muted-foreground">Operational attestations need supporting evidence. Technical requirements do not establish that deployment, recovery or daily close has been verified.</p>}
      </div>
    </SettingsPageGroup>
  </section>
}
