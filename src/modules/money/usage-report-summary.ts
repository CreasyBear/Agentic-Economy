import { z } from 'zod'
import { reconcileUsage, usageReconciliationSchema, type UsageReconciliation } from './usage-reconciliation'
const available=usageReconciliationSchema.options[0]
export const financialReportSummarySchema=available.pick({timeBasis:true,currency:true,providerCurrency:true,exponent:true,totals:true,amountCoverage:true,attributionCoverage:true,transactionCountUnits:true,unattributedTransactionCountUnits:true,bridge:true,authoritativeForConsequences:true,source:true})
export type FinancialReportSummary=z.infer<typeof financialReportSummarySchema>
type Reconciled=Extract<UsageReconciliation,{kind:'available'}>
export function emptyFinancialReportSummary():FinancialReportSummary{
  return financialReportSummarySchema.strip().parse(reconcileUsage({periodStartAt:0,periodEndAt:1,financial:{kind:'available',snapshotAt:1,coverage:'complete',entries:[]},calls:[],sources:[]}))
}
function addTotals(a:FinancialReportSummary['totals'],b:FinancialReportSummary['totals']){
  const totals={...a};for(const field of Object.keys(totals) as Array<keyof typeof totals>)totals[field]=(BigInt(a[field])+BigInt(b[field])).toString();return totals
}
export function appendFinancialReportSummary(previous:FinancialReportSummary,page:Reconciled):FinancialReportSummary{
  const summary=financialReportSummarySchema.parse(previous)
  return financialReportSummarySchema.parse({...summary,totals:addTotals(summary.totals,page.totals),
    transactionCountUnits:(BigInt(summary.transactionCountUnits)+BigInt(page.transactionCountUnits)).toString(),
    unattributedTransactionCountUnits:(BigInt(summary.unattributedTransactionCountUnits)+BigInt(page.unattributedTransactionCountUnits)).toString(),
    amountCoverage:summary.amountCoverage==='partial'||page.amountCoverage==='partial'?'partial':'complete',
    attributionCoverage:summary.attributionCoverage==='partial'||page.attributionCoverage==='partial'?'partial':'complete',
    bridge:summary.bridge.map(row=>{const next=page.bridge.find(candidate=>candidate.callCreated===row.callCreated);if(next===undefined)throw new Error('usage_financial_bridge_missing');return {...row,totals:addTotals(row.totals,next.totals)}}),
  })
}
