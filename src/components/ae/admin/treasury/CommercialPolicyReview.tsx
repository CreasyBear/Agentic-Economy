import type { AdminCommandRequest } from '../actions/actions.contracts'
import { POLICY_LABELS, policyDecimal } from './commercial-policy-form'

type Term = readonly [label: string, value: string]
type ReviewInput = Readonly<Extract<AdminCommandRequest, { action: 'change_commercial_policy' }>['input']>
type ReviewControl = ReviewInput['control']
function controlTerms(control: ReviewControl): { business: Term[]; technical: Term[] } {
  const money = (units: string, currency = 'AUD') => `${currency} ${policyDecimal(units)}`
  const percent = (bps: number) => `${policyDecimal(String(bps), 2)}%`
  switch (control.family) {
    case 'commercial_perimeter': return { business: [['Seller model', 'Agentic Economy as principal reseller'], ['Customer segment', 'Businesses only'], ['Customer crypto entitlement', 'None']], technical: [] }
    case 'tax': return { business: [['Tax on service fees', percent(control.serviceFeeTaxBps)], ['Tax on Calls', control.callTaxBps === undefined ? 'Unspecified' : percent(control.callTaxBps)], ['Tax invoice issuance', control.taxInvoiceIssuance === 'enabled' ? 'Enabled' : 'Disabled pending approval']], technical: [] }
    case 'accounting_client_money': return { business: [['Minimum funding', money(control.minimumFundingPrincipalUnits)], ['Maximum funding', money(control.maximumFundingPrincipalUnits)], ['Funding increment', money(control.fundingIncrementUnits)], ['Customer accessible limit', money(control.legalCustomerMaximumAccessibleUnits)], ['Balance classification', 'Customer contract liability']], technical: [] }
    case 'privacy_retention': return { business: [['Evidence retention', `${control.evidenceRetentionDays} days`], ['Legal hold', 'Supported (owner attestation)']], technical: [] }
    case 'treasury_custody': return { business: [['Minimum treasury buffer', money(control.minimumBufferUnits, 'USDC')], ['Deployment', control.deploymentClass === 'real_money' ? 'Real money (owner attestation)' : control.deploymentClass], ['PostgreSQL protection', control.postgresProtection === 'managed_pitr' ? 'Managed point-in-time recovery (owner attestation)' : 'Disposable fixture'], ['Recovery point objective', `${control.recoveryPointObjectiveMinutes} minutes`], ['Recovery time objective', `${control.recoveryTimeObjectiveMinutes} minutes`]], technical: [['Treasury asset', control.treasuryAsset], ['Treasury decimal places', String(control.treasuryExponent)], ['Ledger authority', 'Formance Community'], ['Ledger version', control.formanceLedgerVersion], ['Gateway version', control.formanceGatewayVersion], ['Schema version', control.formanceSchemaVersion], ['Maximum SDK integer units', control.maximumSdkIntegerUnits], ['Architecture review cumulative units', control.architectureReviewCumulativeUnits]] }
    case 'operations': return { business: [['Funding service fee', percent(control.fundingServiceFeeBps)], ['Buyer pricing margin', percent(control.buyerPricingMarginBps)], ['Commitment lifetime', `${control.commitmentTtlMs / 1_000} seconds`], ['Paid Call reports per day', control.paidCallReportsPerDay === undefined ? 'Default (3)' : String(control.paidCallReportsPerDay)], ['Backup', control.backupControl === 'postgres_pitr' ? 'PostgreSQL point-in-time recovery (owner attestation)' : 'Disposable fixture'], ['Restore', control.restoreControl === 'production_rehearsed' ? 'Production restore rehearsed (owner attestation)' : 'Disposable restore rehearsed'], ['Daily close', control.dailyCloseControl === 'human_signed' ? 'Human signed (owner attestation)' : 'Not required for fixture']], technical: [['SDK version', control.formanceSdkVersion], ['SDK artifact digest', control.formanceSdkArtifactDigest]] }
  }
}
function Terms({ terms }: { terms: readonly Term[] }) {
  return <dl className="grid gap-intra text-sm">{terms.map(([label, value]) => <div key={label} className="grid gap-1 sm:grid-cols-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl>
}
export function CommercialPolicyControlReview({ control }: { control: ReviewControl }) {
  const terms = controlTerms(control)
  return <div className="grid gap-related"><Terms terms={terms.business} />{terms.technical.length === 0 ? null : <details><summary className="cursor-pointer text-sm">Technical requirements (read only)</summary><div className="mt-2"><Terms terms={terms.technical} /></div></details>}</div>
}
/** Both first-owner review and second approval render the exact command, without a live policy lookup. */
export function CommercialPolicyReview({ input }: { input: ReviewInput }) {
  const date = (value: number) => `${new Date(value).toLocaleString('en-AU', { timeZone: 'Australia/Perth' })} Perth time`
  return <section aria-label="Commercial policy terms" className="grid gap-related rounded-lg border border-border p-gutter">
    <h3 className="font-medium">{POLICY_LABELS[input.family]}</h3>
    <Terms terms={[
      ['Change', input.changeKind === 'activate' ? 'Activate a new policy' : input.changeKind === 'replace' ? 'Replace active policy' : 'Suspend active policy'],
      ['Environment', input.environment], ['Revision', String(input.revision)], ['Policy reference', input.policyRef],
      ...(input.expectedCurrentPolicyRef === undefined ? [] : [['Current policy reference', input.expectedCurrentPolicyRef] as const]),
      ['Effective', date(input.effectiveAt)], ['Expires', date(input.expiresAt)],
    ]} />
    <CommercialPolicyControlReview control={input.control} />
    {input.changeKind === 'suspend' ? <p className="text-sm">Suspension stops admission under this policy. The recorded terms remain unchanged.</p> : <p className="text-sm text-muted-foreground">Operational attestations need supporting evidence. Technical requirements do not establish that deployment, recovery or daily close has been verified.</p>}
  </section>
}
