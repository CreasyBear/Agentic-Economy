import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { readCurrentPublishedOperation } from './capabilitySupplyCurrentOperation'
import { readCommercialPolicyGate } from './moneyCommercialPolicy'
import { principalAndSourceArgs, principalValue } from './lib/operationInvocations/contracts'
import { resolveCurrentAgentAuthority } from './lib/operationInvocations/authorityHandlers'
import { inspectLiveX402RequirementRef } from './lib/liveX402RequirementRef'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import {
  materializeRuntimePublishedOperation,
  type PublishedOperation,
} from '@/modules/capability-supply/public'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { currentOperationDigest } from '@/modules/capability-execution/current-operation-commitment'
import {
  normalizeStoredAgentAccessGrant,
} from '@/modules/agent-access/policy'
import {
  audFundingPolicyFromCommercialControls,
  normalizePricingConfig,
  PACKAGE4_FORMANCE_REQUIREMENTS,
  quoteManagedX402BuyerAud,
  splitInclusiveAudTax,
} from '@/modules/money/public'
import { jsonObject } from '@/modules/capability-execution/convex'
import type { LiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import { resolveAndBindLegalCustomer } from './lib/moneyLegalCustomer'

const inspectRefusalCode = v.union(
  v.literal('operation_not_found'),
  v.literal('operation_not_current'),
  v.literal('operation_not_ready'),
  v.literal('operation_unsupported'),
  v.literal('input_invalid'),
  v.literal('grant_not_found'),
  v.literal('budget_exceeded'),
  v.literal('insufficient_balance'),
  v.literal('treasury_capacity_unavailable'),
  v.literal('pricing_setup_required'),
  v.literal('commercial_policy_unavailable'),
  v.literal('inspection_unavailable'),
)
const exactAud = v.object({ currency: v.literal('AUD'), units: v.string(), exponent: v.literal(6) })
const exactUsdc = v.object({ currency: v.literal('USDC'), units: v.string(), exponent: v.literal(6) })
const inspectResult = v.union(
  v.object({
    kind: v.literal('committed'),
    commitmentRef: v.string(),
    operationRef: v.string(),
    operationRevision: v.number(),
    expiresAt: v.number(),
    normalizedInput: jsonObject,
    price: exactAud,
    sourceRequirement: v.optional(exactUsdc),
    account: v.object({ accountRef: v.string(), available: exactAud }),
    budget: v.object({ principalRef: v.string(), maximumPerInvocation: exactAud }),
    policyRefs: v.array(v.string()),
    evidenceDigest: v.string(),
    continuation: v.object({
      action: v.literal('operation.invoke'),
      method: v.literal('POST'),
      path: v.literal('/api/v1/operations/call'),
      input: v.object({ commitmentRef: v.string(), idempotencyKey: v.string() }),
    }),
  }),
  v.object({
    kind: v.literal('refused'),
    operationRef: v.string(),
    code: inspectRefusalCode,
    retryable: v.boolean(),
    reinspection: v.optional(v.object({ action: v.literal('operation.inspect'), operationRef: v.string() })),
  }),
)

type InspectResult = Infer<typeof inspectResult>
type InspectArgs = Readonly<{
  operationKey: string
  correlationId: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
  principal: Infer<typeof principalValue>
  operationRef: string
  input: Record<string, unknown>
  liveX402Requirement?: LiveX402Requirement
}>

const formanceFinancialSnapshot = v.object({
  accountRef: v.string(),
  accountAvailableUnits: v.string(),
  principalRef: v.string(),
  budgetGeneration: v.number(),
  budgetAvailableUnits: v.string(),
  legalCustomerRef: v.string(),
  legalCustomerGeneration: v.number(),
  legalExposureAvailableUnits: v.string(),
  policyGeneration: v.number(),
  formanceSchemaVersion: v.string(),
  buyerTaxBps: v.number(),
  observedAt: v.number(),
  treasury: v.optional(v.object({
    custodyRef: v.string(),
    custodyGeneration: v.number(),
    network: v.string(),
    availableUnits: v.string(),
    evidenceRef: v.string(),
    evidenceDigest: v.string(),
  })),
})

const financialSubjectsResult = v.union(
  v.object({
    kind: v.literal('prepared'),
    accountRef: v.string(),
    principalRef: v.string(),
    budgetGeneration: v.number(),
    budgetUnits: v.string(),
    legalCustomerRef: v.string(),
    legalCustomerGeneration: v.number(),
    legalExposureUnits: v.string(),
    policyDigest: v.string(),
    policyGeneration: v.number(),
    buyerTaxBps: v.number(),
    financialMode: v.union(v.literal('none'), v.literal('formance')),
    treasury: v.optional(v.object({
      custodyRef: v.string(),
      custodyGeneration: v.number(),
      network: v.string(),
      targetUnits: v.string(),
      evidenceRef: v.string(),
      evidenceDigest: v.string(),
    })),
  }),
  v.object({ kind: v.literal('refused'), code: inspectRefusalCode }),
)

type FinancialSubjectsResult = Infer<typeof financialSubjectsResult>

const refuse = (
  operationRef: string,
  code: Extract<InspectResult, { kind: 'refused' }>['code'],
  retryable: boolean,
  reinspection = false,
): InspectResult => ({
  kind: 'refused',
  operationRef,
  code,
  retryable,
  ...(reinspection ? { reinspection: { action: 'operation.inspect', operationRef } } : {}),
})

function operationPricing(operation: PublishedOperation, now: number) {
  const normalized = normalizePricingConfig(operation.pricingConfig)
  if (normalized.kind === 'invalid') return undefined
  if (normalized.config.kind === 'fixed_aud') {
    return {
      kind: 'ready' as const,
      config: normalized.config,
      price: { currency: 'AUD' as const, exponent: 6 as const, units: normalized.config.amountUnits },
    }
  }
  const sourceRequirement = {
    currency: 'USDC' as const,
    exponent: 6 as const,
    units: normalized.config.sourceRequirement.atomicUnits,
  }
  const quoted = quoteManagedX402BuyerAud({
    environment: operation.runtimeEnvironment,
    requiredUsdcAtomicUnits: sourceRequirement.units,
    observedAt: now,
  })
  return quoted.kind === 'refused'
    ? quoted
    : {
        kind: 'ready' as const,
        config: normalized.config,
        price: quoted.evidence.sourceAmount,
        sourceRequirement,
        rateEvidence: quoted.evidence,
      }
}

async function prepareFinancialSubjectsHandler(
  ctx: MutationCtx,
  args: InspectArgs,
): Promise<FinancialSubjectsResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'protected_action')
  if (sourceWrite.kind === 'rejected') return { kind: 'refused', code: 'inspection_unavailable' }
  const now = Date.now()
  const authority = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    now,
    { kind: 'new_operation', operationRef: args.operationRef },
  )
  if (authority === null) return { kind: 'refused', code: 'grant_not_found' }
  const operation = await readCurrentPublishedOperation(ctx, args.operationRef, now)
  if (operation === undefined) return { kind: 'refused', code: 'operation_not_found' }
  const pricing = operationPricing(operation, now)
  if (pricing === undefined) return { kind: 'refused', code: 'operation_unsupported' }
  if (pricing.kind === 'refused') return { kind: 'refused', code: 'pricing_setup_required' }
  const grantRow = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', authority.grantRef))
    .unique()
  const grant = grantRow === null ? undefined : normalizeStoredAgentAccessGrant(grantRow as never)
  if (grant === undefined || grant.generation !== authority.grantGeneration) {
    return { kind: 'refused', code: 'grant_not_found' }
  }
  const policy = await readCommercialPolicyGate(ctx.db, {
    environment: authority.principal.environment,
    now,
    ...(authority.principal.environment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policy.kind === 'refused') return { kind: 'refused', code: 'commercial_policy_unavailable' }
  const legalCustomer = await resolveAndBindLegalCustomer(ctx, authority.principal.ownerId, now)
  if (legalCustomer.kind === 'refused') return { kind: 'refused', code: 'commercial_policy_unavailable' }
  const binding = await ctx.db.query('moneyLegalCustomerBindings')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', authority.principal.ownerId))
    .unique()
  if (binding === null || binding.legalCustomerRef !== legalCustomer.legalCustomerRef) {
    return { kind: 'refused', code: 'commercial_policy_unavailable' }
  }
  const observations = await ctx.db.query('moneyTreasuryObservations')
    .withIndex('by_environment_and_observedAt', (query) => query
      .eq('environment', authority.principal.environment))
    .order('desc')
    .take(2)
  const observation = observations.length === 1 ? observations[0] : undefined
  const fundingPolicy = audFundingPolicyFromCommercialControls(policy.controls)
  const monthly = grant.policy.budget.maximumMonthlySpend
  if (monthly.currency !== 'AUD' || monthly.exponent !== 6) {
    return { kind: 'refused', code: 'budget_exceeded' }
  }
  const treasuryTarget = observation === undefined
    ? undefined
    : (BigInt(observation.totalUnits) - BigInt(observation.bufferUnits)).toString()
  return {
    kind: 'prepared',
    accountRef: authority.principal.ownerId,
    principalRef: authority.principal.principalId,
    budgetGeneration: grant.policy.budget.generation,
    budgetUnits: monthly.units,
    legalCustomerRef: legalCustomer.legalCustomerRef,
    legalCustomerGeneration: binding.version,
    legalExposureUnits: fundingPolicy.legalCustomerMaximumAccessibleUnits.toString(),
    policyDigest: policy.policyDigest,
    policyGeneration: 1,
    buyerTaxBps: policy.controls.tax.serviceFeeTaxBps,
    financialMode: pricing.config.kind === 'fixed_aud' && pricing.price.units === '0'
      ? 'none'
      : 'formance',
    ...(observation === undefined || treasuryTarget === undefined || BigInt(treasuryTarget) <= 0n
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
  }
}

async function issueCommitmentHandler(
  ctx: MutationCtx,
  args: InspectArgs & Readonly<{ formance: Infer<typeof formanceFinancialSnapshot> }>,
): Promise<InspectResult> {
  // The coordinating action has already consumed this source-write admission in
  // prepareFinancialSubjects. Internal mutations must not consume the same nonce twice.
  const now = Date.now()
  const authority = await resolveCurrentAgentAuthority(
    ctx,
    args.principal,
    now,
    { kind: 'new_operation', operationRef: args.operationRef },
  )
  if (authority === null) return refuse(args.operationRef, 'grant_not_found', false)
  const operation = await readCurrentPublishedOperation(ctx, args.operationRef, now)
  if (operation === undefined) return refuse(args.operationRef, 'operation_not_found', false)
  let descriptor
  try {
    descriptor = materializeRuntimePublishedOperation(operation)
  } catch {
    return refuse(args.operationRef, 'operation_unsupported', false)
  }
  if (!isBoundedJsonValue(args.input) || !descriptor.validateInput(args.input)) {
    return refuse(args.operationRef, 'input_invalid', false)
  }
  const currentDigest = currentOperationDigest({ operationRef: args.operationRef, operation })
  if (currentDigest === undefined) return refuse(args.operationRef, 'operation_not_current', false)

  const policyGate = await readCommercialPolicyGate(ctx.db, {
    environment: operation.runtimeEnvironment,
    now,
    ...(operation.runtimeEnvironment === 'sandbox'
      ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
      : {}),
  })
  if (policyGate.kind === 'refused') {
    return refuse(args.operationRef, 'commercial_policy_unavailable', false)
  }

  const grantRow = await ctx.db.query('agentAccessGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', authority.grantRef))
    .unique()
  if (grantRow === null) return refuse(args.operationRef, 'grant_not_found', false)
  const grant = normalizeStoredAgentAccessGrant(grantRow as never)
  if (grant === undefined || grant.generation !== authority.grantGeneration) {
    return refuse(args.operationRef, 'grant_not_found', false)
  }
  if (args.formance.accountRef !== authority.principal.ownerId
    || args.formance.principalRef !== authority.principal.principalId
    || args.formance.budgetGeneration !== grant.policy.budget.generation
    || args.formance.policyGeneration !== 1
    || args.formance.formanceSchemaVersion !== PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion
    || args.formance.observedAt > now
    || now - args.formance.observedAt > 15_000) {
    return refuse(args.operationRef, 'inspection_unavailable', true, true)
  }

  const pricing = operationPricing(operation, now)
  if (pricing === undefined) return refuse(args.operationRef, 'operation_unsupported', false)
  if (pricing.kind === 'refused') {
    return refuse(args.operationRef, 'pricing_setup_required', false)
  }
  const buyerSale = pricing.price.units === '0'
    ? { revenueUnits: '0', taxUnits: '0' }
    : splitInclusiveAudTax(pricing.price.units, args.formance.buyerTaxBps)
  if (buyerSale === undefined) return refuse(args.operationRef, 'pricing_setup_required', false)
  if ((pricing.sourceRequirement === undefined) !== (args.liveX402Requirement === undefined)) {
    return refuse(args.operationRef, 'operation_not_ready', true, true)
  }
  if (args.liveX402Requirement !== undefined) {
    try {
      if (args.liveX402Requirement.observedAt > now
        || now - args.liveX402Requirement.observedAt > 15_000
        || canonicalDigest(JSON.parse(args.liveX402Requirement.requirementJson) as never)
          !== args.liveX402Requirement.requirementDigest) {
        return refuse(args.operationRef, 'operation_not_ready', true, true)
      }
    } catch {
      return refuse(args.operationRef, 'operation_not_ready', true, true)
    }
  }
  const maximum = grant.policy.budget.maximumSpendPerInvocation
  if (maximum.currency !== 'AUD' || maximum.exponent !== 6
    || BigInt(maximum.units) < BigInt(pricing.price.units)) {
    return refuse(args.operationRef, 'budget_exceeded', false)
  }

  const balanceUnits = args.formance.accountAvailableUnits
  if (BigInt(balanceUnits) < BigInt(pricing.price.units)) {
    return refuse(args.operationRef, 'insufficient_balance', false)
  }
  if (BigInt(args.formance.budgetAvailableUnits) < BigInt(pricing.price.units)
    || BigInt(args.formance.legalExposureAvailableUnits) < BigInt(pricing.price.units)) {
    return refuse(args.operationRef, 'budget_exceeded', false)
  }
  const treasury = args.formance.treasury
  if (pricing.sourceRequirement !== undefined
    && (treasury === undefined
      || treasury.network !== pricing.config.sourceRequirement.network
      || BigInt(treasury.availableUnits) < BigInt(pricing.sourceRequirement.units))) {
    return refuse(args.operationRef, 'treasury_capacity_unavailable', true, true)
  }

  const normalizedInput = structuredClone(args.input)
  const inputDigest = canonicalDigest(normalizedInput as never)
  const expiresAt = Math.min(
    now + policyGate.controls.operations.commitmentTtlMs,
    authority.expiresAt,
    pricing.rateEvidence?.expiresAt ?? Number.MAX_SAFE_INTEGER,
  )
  const evidenceMaterial = {
    format: 'ae.operation-commitment:v1',
    principalId: authority.principal.principalId,
    accountRef: authority.principal.ownerId,
    credentialId: authority.principal.credentialId,
    grantRef: authority.grantRef,
    grantGeneration: authority.grantGeneration,
    grantPolicyDigest: authority.policyDigest,
    operationRef: args.operationRef,
    operationRevision: operation.identity.publicationRevision,
    operationMaterialDigest: operation.materialDigest,
    currentOperationDigest: currentDigest,
    inputDigest,
    pricingDigest: operation.priceDigest,
    decisionAudUnits: pricing.price.units,
    ...(pricing.sourceRequirement === undefined ? {} : { sourceUsdcUnits: pricing.sourceRequirement.units }),
    ...(args.liveX402Requirement === undefined ? {} : {
      x402RequirementDigest: args.liveX402Requirement.requirementDigest,
      x402RequirementObservedAt: args.liveX402Requirement.observedAt,
    }),
    ...(pricing.rateEvidence === undefined ? {} : { rateEvidenceDigest: pricing.rateEvidence.evidenceDigest }),
    budgetPolicyRef: grant.policy.budget.budgetPolicyRef,
    budgetGeneration: grant.policy.budget.generation,
    maximumSpendPerInvocationUnits: maximum.units,
    formanceSchemaVersion: args.formance.formanceSchemaVersion,
    legalCustomerRef: args.formance.legalCustomerRef,
    legalCustomerGeneration: args.formance.legalCustomerGeneration,
    buyerRevenueUnits: buyerSale.revenueUnits,
    buyerTaxUnits: buyerSale.taxUnits,
    accountAvailableUnits: args.formance.accountAvailableUnits,
    budgetAvailableUnits: args.formance.budgetAvailableUnits,
    legalExposureAvailableUnits: args.formance.legalExposureAvailableUnits,
    ...(treasury === undefined ? {} : {
      treasuryCustodyRef: treasury.custodyRef,
      treasuryCustodyGeneration: treasury.custodyGeneration,
      treasuryEvidenceRef: treasury.evidenceRef,
      treasurySpendableUnits: treasury.availableUnits,
    }),
    commercialPolicyDigest: policyGate.policyDigest,
    expiresAt,
  }
  const evidenceDigest = canonicalDigest(evidenceMaterial as never)
  const commitmentRef = `operation-commitment:v1:${canonicalDigest({
    ...evidenceMaterial,
    createdAt: now,
    correlationId: args.correlationId,
  }).slice(7)}`
  const existingCommitment = await ctx.db.query('capabilityOperationCommitments')
    .withIndex('by_commitmentRef', (query) => query.eq('commitmentRef', commitmentRef))
    .unique()
  if (existingCommitment !== null
    && (existingCommitment.state !== 'issued'
      || existingCommitment.evidenceDigest !== evidenceDigest
      || existingCommitment.expiresAt <= now)) {
    return refuse(args.operationRef, 'inspection_unavailable', false)
  }
  if (existingCommitment === null) await ctx.db.insert('capabilityOperationCommitments', {
    commitmentRef,
    principalId: authority.principal.principalId,
    accountRef: authority.principal.ownerId,
    credentialId: authority.principal.credentialId,
    applicationRef: authority.principal.applicationRef,
    environment: authority.principal.environment,
    grantRef: authority.grantRef,
    grantGeneration: authority.grantGeneration,
    grantPolicyDigest: authority.policyDigest,
    grantExpiresAt: authority.expiresAt,
    operationRef: args.operationRef,
    operationRevision: operation.identity.publicationRevision,
    operationMaterialDigest: operation.materialDigest,
    currentOperationDigest: currentDigest,
    operationJson: JSON.stringify(operation),
    normalizedInputJson: JSON.stringify(normalizedInput),
    inputDigest,
    pricingJson: JSON.stringify(pricing.config),
    pricingDigest: operation.priceDigest,
    decisionAudUnits: pricing.price.units,
    ...(pricing.sourceRequirement === undefined ? {} : { sourceUsdcUnits: pricing.sourceRequirement.units }),
    ...(args.liveX402Requirement === undefined ? {} : {
      x402RequirementDigest: args.liveX402Requirement.requirementDigest,
      x402RequirementJson: args.liveX402Requirement.requirementJson,
      x402RequirementObservedAt: args.liveX402Requirement.observedAt,
    }),
    ...(pricing.rateEvidence === undefined ? {} : {
      rateEvidenceJson: JSON.stringify(pricing.rateEvidence),
      rateEvidenceDigest: pricing.rateEvidence.evidenceDigest,
    }),
    budgetPolicyRef: grant.policy.budget.budgetPolicyRef,
    budgetGeneration: grant.policy.budget.generation,
    maximumSpendPerInvocationUnits: maximum.units,
    formanceSchemaVersion: args.formance.formanceSchemaVersion,
    policyGeneration: args.formance.policyGeneration,
    legalCustomerRef: args.formance.legalCustomerRef,
    legalCustomerGeneration: args.formance.legalCustomerGeneration,
    buyerRevenueUnits: buyerSale.revenueUnits,
    buyerTaxUnits: buyerSale.taxUnits,
    accountAvailableUnits: args.formance.accountAvailableUnits,
    budgetAvailableUnits: args.formance.budgetAvailableUnits,
    legalExposureAvailableUnits: args.formance.legalExposureAvailableUnits,
    balanceUnits,
    ...(treasury === undefined ? {} : {
      treasuryCustodyRef: treasury.custodyRef,
      treasuryCustodyGeneration: treasury.custodyGeneration,
      treasuryEvidenceRef: treasury.evidenceRef,
      treasuryEvidenceDigest: treasury.evidenceDigest,
      treasurySpendableUnits: treasury.availableUnits,
    }),
    commercialPolicyRefs: [...policyGate.policyRefs],
    commercialPolicyDigest: policyGate.policyDigest,
    evidenceDigest,
    state: 'issued',
    expiresAt,
    createdAt: now,
    updatedAt: now,
  })
  return {
    kind: 'committed',
    commitmentRef,
    operationRef: args.operationRef,
    operationRevision: operation.identity.publicationRevision,
    expiresAt,
    normalizedInput,
    price: pricing.price,
    ...(pricing.sourceRequirement === undefined ? {} : { sourceRequirement: pricing.sourceRequirement }),
    account: {
      accountRef: authority.principal.ownerId,
      available: { currency: 'AUD', exponent: 6, units: balanceUnits },
    },
    budget: { principalRef: authority.principal.principalId, maximumPerInvocation: maximum as never },
    policyRefs: [...policyGate.policyRefs],
    evidenceDigest,
    continuation: {
      action: 'operation.invoke',
      method: 'POST',
      path: '/api/v1/operations/call',
      input: { commitmentRef, idempotencyKey: `invoke:${commitmentRef}` },
    },
  }
}

export const issueCommitment = internalMutation({
  args: {
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    principal: principalValue,
    operationRef: v.string(),
    input: jsonObject,
    liveX402Requirement: v.optional(v.object({
      requirementDigest: v.string(),
      requirementJson: v.string(),
      observedAt: v.number(),
    })),
    formance: formanceFinancialSnapshot,
  },
  returns: inspectResult,
  handler: issueCommitmentHandler,
})

export const prepareFinancialSubjects = internalMutation({
  args: {
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    principal: principalValue,
    operationRef: v.string(),
    input: jsonObject,
  },
  returns: financialSubjectsResult,
  handler: prepareFinancialSubjectsHandler,
})

export const inspect = action({
  args: { ...principalAndSourceArgs, operationRef: v.string(), input: jsonObject },
  returns: inspectResult,
  handler: async (ctx, args): Promise<InspectResult> => {
    const live = await ctx.runAction(inspectLiveX402RequirementRef, {
      operationRef: args.operationRef,
      input: args.input,
    })
    if (live.kind === 'operation_not_found') {
      return refuse(args.operationRef, 'operation_not_found', false)
    }
    if (live.kind === 'operation_unsupported') {
      return refuse(args.operationRef, 'operation_unsupported', false)
    }
    if (live.kind === 'refused') return refuse(args.operationRef, 'operation_not_ready', true, true)
    const subjects: FinancialSubjectsResult = await ctx.runMutation(
      internal.capabilityOperationCommitments.prepareFinancialSubjects,
      args,
    )
    if (subjects.kind === 'refused') return refuse(args.operationRef, subjects.code, true)
    if (subjects.financialMode === 'none') {
      return await ctx.runMutation(internal.capabilityOperationCommitments.issueCommitment, {
        ...args,
        formance: {
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
        },
      })
    }
    const capacityCommands = [
      {
        commandRef: `capacity:agent:${subjects.principalRef}:${subjects.budgetGeneration}`,
        idempotencyKey: `capacity:agent:${subjects.principalRef}:${subjects.budgetGeneration}`,
        kind: 'agent_budget' as const,
        subjectRef: subjects.principalRef,
        generation: subjects.budgetGeneration,
        targetUnits: subjects.budgetUnits,
        policyDigest: subjects.policyDigest,
        externalEvidenceDigest: subjects.policyDigest,
      },
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
      return refuse(args.operationRef, 'treasury_capacity_unavailable', true, true)
    }
    for (const capacity of capacityCommands) {
      const synced = await ctx.runAction(internal.moneyFormance.syncCapacity, capacity)
      if (synced.kind !== 'completed') {
        return refuse(args.operationRef, 'inspection_unavailable', synced.kind !== 'refused', true)
      }
    }
    const [account, budget, exposure, treasury] = await Promise.all([
      ctx.runAction(internal.moneyFormance.readDisplayBalance, {
        balanceKind: 'account_aud', subjectRef: subjects.accountRef,
      }),
      ctx.runAction(internal.moneyFormance.readDisplayBalance, {
        balanceKind: 'agent_budget', subjectRef: subjects.principalRef,
        generation: subjects.budgetGeneration,
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
      || budget.kind !== 'available'
      || exposure.kind !== 'available'
      || (treasury !== undefined && treasury.kind !== 'available')) {
      return refuse(args.operationRef, 'inspection_unavailable', true, true)
    }
    const observedAt = Math.min(
      account.observedAt,
      budget.observedAt,
      exposure.observedAt,
      treasury?.observedAt ?? Number.MAX_SAFE_INTEGER,
    )
    return await ctx.runMutation(
      internal.capabilityOperationCommitments.issueCommitment,
      {
        ...args,
        ...(live.kind === 'observed' ? { liveX402Requirement: live.requirement } : {}),
        formance: {
          accountRef: subjects.accountRef,
          accountAvailableUnits: account.units,
          principalRef: subjects.principalRef,
          budgetGeneration: subjects.budgetGeneration,
          budgetAvailableUnits: budget.units,
          legalCustomerRef: subjects.legalCustomerRef,
          legalCustomerGeneration: subjects.legalCustomerGeneration,
          legalExposureAvailableUnits: exposure.units,
          policyGeneration: subjects.policyGeneration,
          formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
          buyerTaxBps: subjects.buyerTaxBps,
          observedAt,
          ...(subjects.treasury === undefined || treasury === undefined
            ? {}
            : {
                treasury: {
                  custodyRef: subjects.treasury.custodyRef,
                  custodyGeneration: subjects.treasury.custodyGeneration,
                  network: subjects.treasury.network,
                  availableUnits: treasury.units,
                  evidenceRef: subjects.treasury.evidenceRef,
                  evidenceDigest: subjects.treasury.evidenceDigest,
                },
              }),
        },
      },
    )
  },
})

const invocationMaterial = v.union(v.object({
  operationRef: v.string(),
  input: jsonObject,
  decisionPrice: exactAud,
  commitmentRef: v.string(),
  evidenceDigest: v.string(),
  x402RequirementDigest: v.optional(v.string()),
}), v.null())

export const readForInvocation = internalQuery({
  args: {
    principal: principalValue,
    commitmentRef: v.string(),
    idempotencyKey: v.string(),
    now: v.number(),
  },
  returns: invocationMaterial,
  handler: async (ctx, args) => {
    const row = await ctx.db.query('capabilityOperationCommitments')
      .withIndex('by_commitmentRef', (query) => query.eq('commitmentRef', args.commitmentRef))
      .unique()
    if (row === null
      || row.expiresAt <= args.now
      || row.principalId !== args.principal.principalId
      || row.accountRef !== args.principal.ownerId
      || row.credentialId !== args.principal.credentialId
      || row.applicationRef !== args.principal.applicationRef
      || row.environment !== args.principal.environment) return null
    if (row.state === 'consumed') {
      if (row.consumedInvocationRef === undefined) return null
      const invocation = await ctx.db.query('capabilityOperationInvocations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', row.consumedInvocationRef!))
        .unique()
      if (invocation === null
        || invocation.commitmentRef !== row.commitmentRef
        || invocation.credentialId !== args.principal.credentialId
        || invocation.idempotencyKey !== args.idempotencyKey) return null
    } else if (row.state !== 'issued') return null
    try {
      const input = JSON.parse(row.normalizedInputJson) as unknown
      return isBoundedJsonValue(input) && typeof input === 'object' && input !== null && !Array.isArray(input)
        ? {
            operationRef: row.operationRef,
            input: input as Record<string, Infer<typeof jsonObject>[string]>,
            decisionPrice: { currency: 'AUD' as const, exponent: 6 as const, units: row.decisionAudUnits },
            commitmentRef: row.commitmentRef,
            evidenceDigest: row.evidenceDigest,
            ...(row.x402RequirementDigest === undefined
              ? {}
              : { x402RequirementDigest: row.x402RequirementDigest }),
          }
        : null
    } catch {
      return null
    }
  },
})

export const admitInvocation = internalMutation({
  args: {
    operationKey: v.string(),
    correlationId: v.string(),
    ...sourceWriteArgs,
    principal: principalValue,
    commitmentRef: v.string(),
    idempotencyKey: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => (await requireSourceWrite(ctx, args, 'protected_action')).kind === 'accepted',
})
