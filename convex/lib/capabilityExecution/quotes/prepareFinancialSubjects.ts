import { v } from 'convex/values'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { resolveServiceMode, serviceModeAllowsEnvironment } from '@/lib/deployment/service-mode'
import { isBoundedJsonValue, openCapabilityDecisionModel } from '@/modules/capability-contract/public'
import {
  normalizeStoredAgentAccessGrant,
  projectAgentAccessGrant,
} from '@/modules/agent-access/policy'
import {
  audFundingPolicyFromCommercialControls,
  normalizePricingConfig,
  type CommercialPolicyRefusalReason,
  type SpendingPeriodAdjustment,
  type SpendingPeriods,
} from '@/modules/money/public'
import {
  cdpX402CustodyBudgetRef,
  cdpX402CustodyConfigurationFromEnvironment,
  x402PaymentProfileForEnvironment,
} from '@/modules/capability-supply/convex'
import { jsonObject } from '@/modules/capability-execution/convex'

import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { readManagedX402InspectionTarget } from '../../capabilitySupply/currentTool/inspection'
import { readCommercialPolicyGate } from '../../../moneyCommercialPolicy'
import { principalValue } from '../callLifecycle/contracts'
import { resolveCurrentAgentAuthority } from '../callLifecycle/agentCallAuthority'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { resolveAndBindLegalCustomer } from '../../money/legalCustomer/binding'
import { toolProviderRouteabilityIsFrozen } from '../../capabilitySupply/providerOffboarding/freeze'
import { prepareAgentSpendingPeriods } from '../../money/spendingPeriods/periods'
import { treasurySpendableUnits } from './quoteValuation'
import { cdpX402CustodyEnvironment } from './environmentHelpers'
import {
  financialSubjectsResult,
  type FinancialSubjectsResult,
  type QuoteArgs,
} from './contracts'
import { env, type MutationCtx } from '../../../_generated/server'

const LEGAL_CUSTOMER_REQUIRED: CommercialPolicyRefusalReason = 'legal_customer_required'

export const prepareFinancialSubjectsArgs = {
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
  principal: principalValue,
  toolRef: v.string(),
  input: jsonObject,
}

export const prepareFinancialSubjectsResult = financialSubjectsResult

export async function prepareFinancialSubjectsHandler(
  ctx: MutationCtx,
  args: QuoteArgs,
): Promise<FinancialSubjectsResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'protected_action')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'inspection_unavailable', reason: sourceWrite.reason }
  return await prepareFinancialSubjectsCore(ctx, args)
}

/** Called only after the public source-write gate or the trusted chat mutation's live turn/grant check. */
export async function prepareFinancialSubjectsCore(
  ctx: MutationCtx,
  args: QuoteArgs,
): Promise<FinancialSubjectsResult> {
  const now = Date.now()
  const authority = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    now,
    { kind: 'new_operation', toolRef: args.toolRef },
  )
  if (authority === null) return { kind: 'refused', code: 'grant_not_found' }
  if (!serviceModeAllowsEnvironment(resolveServiceMode(env), authority.principal.environment)) {
    return { kind: 'refused', code: 'tool_unsupported', reason: 'This deployment does not admit purchases in this environment.' }
  }
  if (await toolProviderRouteabilityIsFrozen(ctx, args.toolRef)) {
    return { kind: 'refused', code: 'tool_not_ready' }
  }
  const operation = await readCurrentPublishedTool(ctx, args.toolRef, now)
    ?? await readManagedX402InspectionTarget(ctx, args.toolRef, now)
  if (operation === undefined) return { kind: 'refused', code: 'tool_not_found' }
  if (operation.runtimeEnvironment !== authority.principal.environment) return {
    kind: 'refused', code: 'tool_unsupported',
    reason: `This Tool uses the ${operation.runtimeEnvironment} environment; your agent uses ${authority.principal.environment}. Connect an agent for ${operation.runtimeEnvironment} before calling it.`,
  }
  let descriptor
  try { descriptor = openCapabilityDecisionModel(operation.contract) } catch (cause) { return degradeBackend(cause, { kind: 'refused', code: 'tool_unsupported' } as const, { site: 'prepareFinancialSubjectsHandler', reason: 'invalid_response' }) }
  if (!isBoundedJsonValue(args.input) || descriptor.validateInput(args.input).kind !== 'valid') return { kind: 'refused', code: 'input_invalid' }
  const pricing = normalizePricingConfig(operation.pricingConfig)
  if (pricing.kind !== 'valid') return { kind: 'refused', code: 'tool_unsupported' }
  const managedApprovalQuote = pricing.config.kind === 'managed_x402'
    && authority.principal.authorityMode === 'approval_required'
  if (pricing.config.kind === 'managed_x402'
    && authority.principal.authorityMode !== 'spending_policy'
    && authority.principal.authorityMode !== 'unrestricted_test_only'
    && !managedApprovalQuote) return { kind: 'refused', code: 'grant_not_found' }
  const grantRow = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', authority.grantRef))
    .unique()
  const grant = grantRow === null ? undefined : normalizeStoredAgentAccessGrant(grantRow as never)
  if (grant === undefined || grant.generation !== authority.grantGeneration) {
    return { kind: 'refused', code: 'grant_not_found' }
  }
  const grantReadback = projectAgentAccessGrant(grant)
  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: authority.principal.environment,
    now,
    ...(authority.principal.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused') return { kind: 'refused', code: 'commercial_policy_unavailable', reason: policy.code }
  const legalCustomer = await resolveAndBindLegalCustomer(ctx, authority.principal.ownerId, now)
  if (legalCustomer.kind === 'refused') return {
    kind: 'refused', code: 'commercial_policy_unavailable', reason: LEGAL_CUSTOMER_REQUIRED,
  }
  const binding = await ctx.db.query('moneyLegalCustomerBindings')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', authority.principal.ownerId))
    .unique()
  if (binding === null || binding.legalCustomerRef !== legalCustomer.legalCustomerRef) {
    return {
      kind: 'refused', code: 'commercial_policy_unavailable', reason: LEGAL_CUSTOMER_REQUIRED,
    }
  }
  const environment = authority.principal.environment
  const custodyConfiguration = cdpX402CustodyConfigurationFromEnvironment(
    cdpX402CustodyEnvironment(),
  )
  const paymentProfile = x402PaymentProfileForEnvironment(environment)
  const custodyRef = custodyConfiguration === undefined || paymentProfile === undefined
    ? undefined
    : cdpX402CustodyBudgetRef(custodyConfiguration, environment)
  const custodyGeneration = custodyConfiguration?.credentialGeneration
  const observation = custodyRef === undefined || custodyGeneration === undefined
    ? undefined
    : (await ctx.db.query('moneyTreasuryObservations')
        .withIndex('by_custody_and_observedAt', (query) => query
          .eq('environment', environment)
          .eq('custodyRef', custodyRef)
          .eq('custodyGeneration', custodyGeneration))
        .order('desc')
        .take(1))[0]
  const treasuryTarget = observation === undefined
    || custodyRef === undefined
    || custodyGeneration === undefined
    || paymentProfile === undefined
    ? undefined
    : treasurySpendableUnits(observation, {
        environment,
        custodyRef,
        custodyGeneration,
        network: paymentProfile.network,
      })
  const fundingPolicy = audFundingPolicyFromCommercialControls(policy.controls)
  const daily = grantReadback.budget.maximumDailySpend
  const monthly = grantReadback.budget.maximumMonthlySpend
  if (daily.currency !== 'AUD' || daily.exponent !== 6
    || monthly.currency !== 'AUD' || monthly.exponent !== 6) {
    return { kind: 'refused', code: 'budget_exceeded' }
  }
  const financialMode = pricing.config.kind === 'fixed_aud' && pricing.config.amountUnits === '0'
    ? 'none' as const
    : 'formance' as const
  let spendingPeriods: SpendingPeriods | undefined
  let spendingPeriodCommands: SpendingPeriodAdjustment[] = []
  if (financialMode === 'formance') {
    const prepared = await prepareAgentSpendingPeriods(ctx, {
      principalRef: authority.principal.principalId,
      dailyLimitUnits: daily.units,
      monthlyLimitUnits: monthly.units,
      authorityDigest: authority.policyDigest,
      now,
    })
    if (prepared.kind === 'refused') {
      return { kind: 'refused', code: 'inspection_unavailable', reason: prepared.reason }
    }
    spendingPeriods = prepared.spendingPeriods
    spendingPeriodCommands = [...prepared.commands]
  }
  const monthlySpendBudgetRow = await ctx.db
    .query('moneyMonthlySpendBudgets')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', authority.principal.ownerId))
    .unique()
  const organizationMonthlySpendBudget = monthlySpendBudgetRow !== null && monthlySpendBudgetRow.enabled
    ? { enabled: true as const, ceilingUnits: monthlySpendBudgetRow.ceilingUnits }
    : undefined
  return {
    kind: 'prepared',
    accountRef: authority.principal.ownerId,
    principalRef: authority.principal.principalId,
    budgetGeneration: grantReadback.budget.generation,
    budgetUnits: monthly.units,
    legalCustomerRef: legalCustomer.legalCustomerRef,
    legalCustomerGeneration: binding.version,
    legalExposureUnits: fundingPolicy.legalCustomerMaximumAccessibleUnits.toString(),
    policyDigest: policy.policyDigest,
    policyGeneration: 1,
    buyerTaxBps: 0,
    financialMode,
    authorityDigest: authority.policyDigest,
    dailyLimitUnits: daily.units,
    monthlyLimitUnits: monthly.units,
    ...(spendingPeriods === undefined ? {} : { spendingPeriods }),
    spendingPeriodCommands,
    ...(observation === undefined || treasuryTarget === undefined
      ? {}
      : {
          treasury: {
            custodyRef: observation.custodyRef,
            custodyGeneration: observation.custodyGeneration,
            network: observation.network,
            targetUnits: treasuryTarget,
            evidenceRef: observation.evidenceRef,
            evidenceDigest: observation.evidenceDigest,
          },
        }),
    ...(organizationMonthlySpendBudget === undefined ? {} : { organizationMonthlySpendBudget }),
    ...(managedApprovalQuote ? { x402QuoteSource: 'persisted' as const } : {}),
  }
}
