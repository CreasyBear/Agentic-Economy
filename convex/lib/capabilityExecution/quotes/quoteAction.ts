import type { Infer } from 'convex/values'
import { planNodeValue } from '../plans/nodeMaterial'
import { MANAGED_CALL_FORMANCE_SCHEMA_VERSION } from '@/modules/money/public'
import { recordJourneyOutcome, recordQuoteJourney } from '@/lib/observability/journey'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { bindPersistedManagedX402RequirementRef, inspectLiveX402RequirementRef } from '../liveX402Requirement/requirementRef'
import { synchronizeSpendingPeriods } from './prepareSpendingPeriods'
import { spendingPeriodPreparationIsRetryable } from './quoteValuation'
import { readOrganizationMonthlySpendSnapshotForQuote } from './environmentHelpers'
import { refuse } from './refusalHelpers'
import {
  quoteActionArgsShape,
  quoteResult,
  type FinancialSubjectsResult,
  type QuoteArgs,
  type QuoteResult,
} from './contracts'

export const quoteArgs = quoteActionArgsShape

export const quoteActionResult = quoteResult

export async function quoteActionHandler(
  ctx: ActionCtx,
  args: QuoteArgs,
): Promise<QuoteResult> {
  const subjects: FinancialSubjectsResult = await ctx.runMutation(
    internal.capabilityQuotes.prepareFinancialSubjects,
    args,
  )
  return await quoteActionCore(ctx, args, subjects)
}

/** Shared public and trusted-chat Quote path after transactional admission. */
export async function quoteActionCore(
  ctx: ActionCtx,
  args: QuoteArgs,
  subjects: FinancialSubjectsResult,
  turnRef?: string,
  planNode?: Infer<typeof planNodeValue>,
): Promise<QuoteResult> {
  try {
    const result = await evaluateQuoteAction(ctx, args, subjects, turnRef, planNode)
    recordQuoteJourney(result)
    return result
  } catch (cause) {
    recordJourneyOutcome({ journey: 'quote', outcome: 'refused_by_fault', good: false })
    throw cause
  }
}

async function evaluateQuoteAction(
  ctx: ActionCtx,
  args: QuoteArgs,
  subjects: FinancialSubjectsResult,
  turnRef?: string,
  planNode?: Infer<typeof planNodeValue>,
): Promise<QuoteResult> {
  if (subjects.kind === 'refused') return refuse(args, subjects.code, subjects.code !== 'input_invalid' && subjects.code !== 'grant_not_found' && subjects.code !== 'tool_unsupported'
    && (subjects.code !== 'inspection_unavailable' || spendingPeriodPreparationIsRetryable(subjects.reason)), {
    ...(subjects.reason === undefined ? {} : { reason: subjects.reason }),
  })
  let spendingPeriods = subjects.spendingPeriods
  if (subjects.financialMode === 'formance' && planNode === undefined) {
    const prepared = await synchronizeSpendingPeriods(ctx, subjects, args.principal, args.toolRef)
    if (prepared.kind === 'refused') return refuse(args, 'inspection_unavailable', spendingPeriodPreparationIsRetryable(prepared.reason), { reason: prepared.reason })
    spendingPeriods = prepared.spendingPeriods
  }
  const persistedQuote = planNode === undefined && subjects.x402QuoteSource === 'persisted'
  const live = persistedQuote
    ? await ctx.runAction(bindPersistedManagedX402RequirementRef, {
        toolRef: args.toolRef,
        input: args.input,
      })
    : await ctx.runAction(inspectLiveX402RequirementRef, {
        principal: args.principal,
        toolRef: args.toolRef,
        input: args.input,
        ...(planNode === undefined ? {} : { planNode }),
      })
  if (live.kind === 'operation_not_found') {
    return refuse(args, 'tool_not_found', false)
  }
  if (live.kind === 'operation_unsupported') {
    return refuse(args, 'tool_unsupported', false)
  }
  if (live.kind === 'refused' || (persistedQuote && live.kind !== 'observed')) {
    return refuse(args, 'tool_not_ready', !persistedQuote)
  }
  if (subjects.financialMode === 'none') {
    const organizationMonthlySpend = await readOrganizationMonthlySpendSnapshotForQuote(ctx, subjects)
    return await ctx.runMutation(internal.capabilityQuotes.issueQuote, {
      ...args,
      ...(turnRef === undefined ? {} : { turnRef }),
      ...(planNode === undefined ? {} : { planNode }),
      formance: {
        policyDigest: subjects.policyDigest,
        accountRef: subjects.accountRef,
        accountAvailableUnits: '0',
        principalRef: subjects.principalRef,
        budgetGeneration: subjects.budgetGeneration,
        budgetAvailableUnits: subjects.budgetUnits,
        legalCustomerRef: subjects.legalCustomerRef,
        legalCustomerGeneration: subjects.legalCustomerGeneration,
        legalExposureAvailableUnits: subjects.legalExposureUnits,
        policyGeneration: subjects.policyGeneration,
        formanceSchemaVersion: MANAGED_CALL_FORMANCE_SCHEMA_VERSION,
        buyerTaxBps: subjects.buyerTaxBps,
        observedAt: Date.now(),
        ...(organizationMonthlySpend === undefined ? {} : { organizationMonthlySpend }),
      },
    })
  }
  const capacityCommands = [
    {
      commandRef: `capacity:legal:${subjects.legalCustomerRef}:${subjects.legalCustomerGeneration}`,
      idempotencyKey: `capacity:legal:${subjects.legalCustomerRef}:${subjects.legalCustomerGeneration}`,
      kind: 'legal_customer_exposure' as const,
      subjectRef: subjects.legalCustomerRef,
      generation: subjects.legalCustomerGeneration,
      targetUnits: subjects.legalExposureUnits,
      policyDigest: subjects.policyDigest,
      externalEvidenceDigest: subjects.policyDigest,
    },
  ]
  if (live.kind === 'observed' && subjects.treasury === undefined) {
    return refuse(args, 'treasury_capacity_unavailable', true)
  }
  for (const capacity of capacityCommands) {
    const synced = await ctx.runAction(internal.moneyFormance.syncCapacity, { ...capacity, expectedEnvironment: subjects.expectedEnvironment })
    if (synced.kind !== 'completed') {
      return refuse(args, 'inspection_unavailable', synced.kind !== 'refused')
    }
  }
  const periodSnapshot = spendingPeriods
  if (periodSnapshot === undefined) return refuse(args, 'inspection_unavailable', true)
  const [account, dailyPeriod, monthlyPeriod, exposure, treasury] = await Promise.all([
    ctx.runAction(internal.moneyAccountCreditBalance.read, {
      accountRef: subjects.accountRef,
    }),
    ctx.runAction(internal.moneyFormance.readSpendingPeriod, {
      principalRef: subjects.principalRef,
      periodKind: 'day',
      periodStartAt: periodSnapshot.daily.periodStartAt,
      periodEndAt: periodSnapshot.daily.periodEndAt,
    }),
    ctx.runAction(internal.moneyFormance.readSpendingPeriod, {
      principalRef: subjects.principalRef,
      periodKind: 'month',
      periodStartAt: periodSnapshot.monthly.periodStartAt,
      periodEndAt: periodSnapshot.monthly.periodEndAt,
    }),
    ctx.runAction(internal.moneyFormance.readDisplayBalance, {
      balanceKind: 'legal_customer_exposure', subjectRef: subjects.legalCustomerRef,
      generation: subjects.legalCustomerGeneration,
    }),
    subjects.treasury === undefined
      ? Promise.resolve(undefined)
      : ctx.runAction(internal.moneyFormance.readDisplayBalance, {
          balanceKind: 'treasury_usdc', subjectRef: subjects.treasury.custodyRef,
          generation: subjects.treasury.custodyGeneration,
        }),
  ])
  if (account.kind !== 'available'
    || dailyPeriod.kind !== 'available'
    || monthlyPeriod.kind !== 'available'
    || exposure.kind !== 'available'
    || (treasury !== undefined && treasury.kind !== 'available')) {
    return refuse(args, 'inspection_unavailable', true)
  }
  const observedAt = Math.min(
    account.observedAt,
    dailyPeriod.observedAt,
    monthlyPeriod.observedAt,
    exposure.observedAt,
    treasury?.observedAt ?? Number.MAX_SAFE_INTEGER,
  )
  const organizationMonthlySpend = await readOrganizationMonthlySpendSnapshotForQuote(ctx, subjects)
  return await ctx.runMutation(
    internal.capabilityQuotes.issueQuote,
    {
      ...args,
      ...(turnRef === undefined ? {} : { turnRef }),
      ...(planNode === undefined ? {} : { planNode }),
      ...(live.kind === 'observed' ? { liveX402Requirement: live.requirement } : {}),
      formance: {
        policyDigest: subjects.policyDigest,
        accountRef: subjects.accountRef,
        accountAvailableUnits: account.units,
        principalRef: subjects.principalRef,
        budgetGeneration: subjects.budgetGeneration,
        // Keep the historical field as a compatibility projection of the
        // monthly period readback. New admission uses both period fields.
        budgetAvailableUnits: monthlyPeriod.units,
        spendingPeriods: periodSnapshot,
        dailyPeriodAvailableUnits: dailyPeriod.units,
        monthlyPeriodAvailableUnits: monthlyPeriod.units,
        dailyPeriodObservedAt: dailyPeriod.observedAt,
        monthlyPeriodObservedAt: monthlyPeriod.observedAt,
        legalCustomerRef: subjects.legalCustomerRef,
        legalCustomerGeneration: subjects.legalCustomerGeneration,
        legalExposureAvailableUnits: exposure.units,
        policyGeneration: subjects.policyGeneration,
        formanceSchemaVersion: MANAGED_CALL_FORMANCE_SCHEMA_VERSION,
        buyerTaxBps: subjects.buyerTaxBps,
        observedAt,
        ...(organizationMonthlySpend === undefined ? {} : { organizationMonthlySpend }),
        ...(subjects.treasury === undefined || treasury === undefined
          ? {}
          : {
              treasury: {
                custodyRef: subjects.treasury.custodyRef,
                custodyGeneration: subjects.treasury.custodyGeneration,
                network: subjects.treasury.network,
                availableUnits: BigInt(treasury.units) < BigInt(subjects.treasury.targetUnits)
                  ? treasury.units
                  : subjects.treasury.targetUnits,
                evidenceRef: subjects.treasury.evidenceRef,
                evidenceDigest: subjects.treasury.evidenceDigest,
              },
            }),
      },
    },
  )
}
