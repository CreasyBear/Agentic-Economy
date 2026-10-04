"use node"

import { formanceAccountMetadataDigest, configuredContext, readFormanceUsageReconciliation, readFormanceUsageReconciliationPage,readFormanceCredentialActivityPage } from './gateway'
import type { FinancialUsageRead } from '@/modules/money/public'
import { usageReadSourceDigest } from '@/modules/money/usage-read-source'

export async function readUsageReconciliationHandler(_ctx: unknown, args: {
  accountRef: string; periodStartAt: number; periodEndAt: number; snapshotAt?: number; expectedSourceDigest?: string
}): Promise<FinancialUsageRead> {
  const accountDigest = formanceAccountMetadataDigest(args.accountRef)
  if (accountDigest === undefined) return { kind: 'setup_required', code: 'formance_reconciliation_query_invalid' }
  const context = configuredContext()
  if (context.kind === 'configured' && args.expectedSourceDigest !== undefined && args.expectedSourceDigest !== usageReadSourceDigest(context.context.configuration)) return {kind: 'unavailable', code: 'monthly_draft_ledger_source_changed'}
  return context.kind === 'setup_required' ? context : await readFormanceUsageReconciliation(context.context, { ...args, accountDigest, ...(args.snapshotAt === undefined ? {} : { now: args.snapshotAt }) })
}

export async function readUsageReconciliationPageHandler(_ctx:unknown,args:{accountRef:string;periodStartAt:number;periodEndAt:number;snapshotAt:number;expectedSourceDigest:string;cursor:string|null;lastTransactionId:string|null}){
  const accountDigest=formanceAccountMetadataDigest(args.accountRef),context=configuredContext()
  if(accountDigest===undefined)return {kind:'setup_required' as const,code:'formance_reconciliation_query_invalid'}
  if(context.kind!=='configured')return context
  if(args.expectedSourceDigest!==usageReadSourceDigest(context.context.configuration))return {kind:'unavailable' as const,code:'monthly_draft_ledger_source_changed'}
  return await readFormanceUsageReconciliationPage(context.context,{...args,accountDigest,now:args.snapshotAt})
}

export async function readCredentialActivityPageHandler(_ctx:unknown,args:{accountRef:string;credentialRef:string;cursor?:string}){
  const context=configuredContext(),accountDigest=formanceAccountMetadataDigest(args.accountRef),cursorKey=process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if(context.kind!=='configured')return context
  if(accountDigest===undefined||cursorKey===undefined||cursorKey.length<32)return {kind:'setup_required' as const,code:'credential_activity_configuration_invalid'}
  return await readFormanceCredentialActivityPage(context.context,{...args,accountDigest,cursorKey})
}
