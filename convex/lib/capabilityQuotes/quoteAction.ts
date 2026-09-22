import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import { inspectLiveX402RequirementRef } from '../../lib/liveX402RequirementRef'
import { fetchCoinbaseReferenceRate } from '@/modules/money/reference-rate'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'
import { spendingPeriodPreparationIsRetryable } from './quoteValuation'
import { readOrganizationMonthlySpendSnapshotForQuote } from './environmentHelpers'
import { refuse } from './refusalHelpers'
import {
  quoteActionArgsShape,
  quoteResult,
  type FinancialSubjectsResult,
  type QuoteArgs,
  type QuoteResult,
} from './validators'

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
  if (subjects.kind === 'refused') return refuse(args, subjects.code, subjects.code !== 'input_invalid' && subjects.code !== 'grant_not_found' && subjects.code !== 'tool_unsupported'
    && (subjects.code !== 'inspection_unavailable' || spendingPeriodPreparationIsRetryable(subjects.reason)), {
    ...(subjects.reason === undefined ? {} : { reason: subjects.reason }),
  })
  let spendingPeriods = subjects.spendingPeriods
  if (subjects.financialMode === 'formance') {
    if (spendingPeriods === undefined) return refuse(args, 'inspection_unavailable', true)
    let commands = [...subjects.spendingPeriodCommands]
    // A pending command is an externally observable control effect. Apply at
    // most two rounds, re-preparing after each acknowledgement so an
    // interrupted prior revision and one current policy change can recover
    // without turning Quote creation into an unbounded retry loop.
    for (let round = 0; round < 2 && commands.length > 0; round += 1) {
      for (const command of commands) {
        const adjusted = await ctx.runAction(internal.moneyFormance.adjustSpendingPeriod, command)
        const expectedReferenceCount = command.previousLimitUnits === command.targetLimitUnits ? 0 : 1
        if (adjusted.kind !== 'completed' || adjusted.transactionRefs.length !== expectedReferenceCount) {
          return refuse(args, 'inspection_unavailable', true)
        }
        const acknowledged = await ctx.runMutation(internal.agentSpendingPeriods.acknowledge, {
          command,
          transactionRefs: [...adjusted.transactionRefs],
        })
        if (acknowledged.kind === 'conflict') return refuse(args, 'inspection_unavailable', true)
      }
      const refreshed = await ctx.runMutation(internal.capabilityQuotes.prepareSpendingPeriods, {
        principal: args.principal,
        toolRef: args.toolRef,
      })
      if (refreshed.kind === 'refused') {
        return refuse(args, 'inspection_unavailable', spendingPeriodPreparationIsRetryable(refreshed.reason), { reason: refreshed.reason })
      }
      spendingPeriods = refreshed.spendingPeriods
      commands = [...refreshed.commands]
    }
    if (commands.length > 0) return refuse(args, 'inspection_unavailable', true)
  }
  const live = await ctx.runAction(inspectLiveX402RequirementRef, {
    principal: args.principal,
    toolRef: args.toolRef,
    input: args.input,
  })
  if (live.kind === 'operation_not_found') {
    return refuse(args, 'tool_not_found', false)
  }
  if (live.kind === 'operation_unsupported') {
    return refuse(args, 'tool_unsupported', false)
  }
  if (live.kind === 'refused') return refuse(args, 'tool_not_ready', true)
  const referenceRate = live.kind === 'observed' ? await fetchCoinbaseReferenceRate() : undefined
  if (live.kind === 'observed' && referenceRate === undefined) return refuse(args, 'pricing_setup_required', true, { reason: 'AUD reference price temporarily unavailable' })
  if (subjects.financialMode === 'none') {
    const organizationMonthlySpend = await readOrganizationMonthlySpendSnapshotForQuote(ctx, subjects)
    return await ctx.runMutation(internal.capabilityQuotes.issueQuote, {
      ...args,
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
        formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
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
    ...(live.kind === 'observed' && subjects.treasury !== undefined
      ? [{
          commandRef: `capacity:treasury:${subjects.treasury.custodyRef}:${subjects.treasury.custodyGeneration}`,
          idempotencyKey: `capacity:treasury:${subjects.treasury.custodyRef}:${subjects.treasury.custodyGeneration}`,
          kind: 'treasury_usdc' as const,
          subjectRef: subjects.treasury.custodyRef,
          generation: subjects.treasury.custodyGeneration,
          targetUnits: subjects.treasury.targetUnits,
          policyDigest: subjects.policyDigest,
          externalEvidenceDigest: subjects.treasury.evidenceDigest,
        }]
      : []),
  ]
  if (live.kind === 'observed' && subjects.treasury === undefined) {
    return refuse(args, 'treasury_capacity_unavailable', true)
  }
  for (const capacity of capacityCommands) {
    const synced = await ctx.runAction(internal.moneyFormance.syncCapacity, capacity)
    if (synced.kind !== 'completed') {
      return refuse(args, 'inspection_unavailable', synced.kind !== 'refused')
    }
  }
  const periodSnapshot = spendingPeriods
  if (periodSnapshot === undefined) return refuse(args, 'inspection_unavailable', true)
  const [account, dailyPeriod, monthlyPeriod, exposure, treasury] = await Promise.all([
    ctx.runAction(internal.moneyFormance.readDisplayBalance, {
      balanceKind: 'account_aud', subjectRef: subjects.accountRef,
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
      ...(live.kind === 'observed' ? { liveX402Requirement: live.requirement } : {}),
      ...(referenceRate === undefined ? {} : { referenceRate }),
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
        formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
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
