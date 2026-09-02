import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import { action, internalMutation, internalQuery, type MutationCtx } from './_generated/server'
import { readCurrentPublishedOperation } from './capabilitySupplyCurrentOperation'
import { readCommercialPolicyGate } from './moneyCommercialPolicy'
import { principalAndSourceArgs, principalValue } from './lib/operationInvocations/contracts'
import { resolveCurrentAgentAuthority } from './lib/operationInvocations/authorityHandlers'
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
  normalizePricingConfig,
  quoteManagedX402BuyerAud,
} from '@/modules/money/public'
import { jsonObject } from '@/modules/capability-execution/convex'

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
    treasury: v.optional(v.object({ spendable: exactUsdc })),
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
}>

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

async function issueCommitmentHandler(ctx: MutationCtx, args: InspectArgs): Promise<InspectResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'protected_action')
  if (sourceWrite.kind === 'rejected') return refuse(args.operationRef, 'inspection_unavailable', true)
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

  const pricing = operationPricing(operation, now)
  if (pricing === undefined) return refuse(args.operationRef, 'operation_unsupported', false)
  if (pricing.kind === 'refused') {
    return refuse(args.operationRef, 'pricing_setup_required', false)
  }
  const maximum = grant.policy.budget.maximumSpendPerInvocation
  if (maximum.currency !== 'AUD' || maximum.exponent !== 6
    || BigInt(maximum.units) < BigInt(pricing.price.units)) {
    return refuse(args.operationRef, 'budget_exceeded', false)
  }

  const balanceLedgerAccountRef = `ledger:aud:customer-prepayment:${authority.principal.ownerId}`
  const balance = await ctx.db.query('moneyBalanceProjections')
    .withIndex('by_accountRef_and_asset', (query) => query
      .eq('accountRef', authority.principal.ownerId)
      .eq('asset', 'AUD'))
    .unique()
  const balanceUnits = balance?.balanceUnits ?? '0'
  if ((balance !== null && balance.state !== 'active')
    || BigInt(balanceUnits) < BigInt(pricing.price.units)) {
    return refuse(args.operationRef, 'insufficient_balance', false)
  }

  const treasuryRows = pricing.sourceRequirement === undefined
    ? []
    : await ctx.db.query('moneyTreasuryProjections')
        .withIndex('by_environment_and_updatedAt', (query) => query.eq('environment', operation.runtimeEnvironment))
        .order('desc')
        .take(2)
  const treasury = pricing.sourceRequirement === undefined ? undefined : treasuryRows[0]
  if (pricing.sourceRequirement !== undefined
    && (treasuryRows.length !== 1
      || treasury === undefined
      || treasury.network !== pricing.config.sourceRequirement.network
      || treasury.asset !== 'USDC'
      || BigInt(treasury.spendableUnits) < BigInt(pricing.sourceRequirement.units))) {
    return refuse(args.operationRef, 'treasury_capacity_unavailable', true, true)
  }

  const normalizedInput = structuredClone(args.input)
  const inputDigest = canonicalDigest(normalizedInput as never)
  const expiresAt = Math.min(
    now + 5 * 60 * 1_000,
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
    ...(pricing.rateEvidence === undefined ? {} : { rateEvidenceDigest: pricing.rateEvidence.evidenceDigest }),
    budgetPolicyRef: grant.policy.budget.budgetPolicyRef,
    budgetGeneration: grant.policy.budget.generation,
    maximumSpendPerInvocationUnits: maximum.units,
    balanceVersion: balance?.version ?? 0,
    balanceChecksum: balance?.checksum ?? canonicalDigest({ accountRef: authority.principal.ownerId, balanceUnits: '0' }),
    ...(treasury === undefined ? {} : {
      treasuryCustodyRef: treasury.custodyRef,
      treasuryCustodyGeneration: treasury.custodyGeneration,
      treasuryVersion: treasury.version,
      treasuryEvidenceRef: treasury.lastObservationRef,
      treasurySpendableUnits: treasury.spendableUnits,
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
    ...(pricing.rateEvidence === undefined ? {} : {
      rateEvidenceJson: JSON.stringify(pricing.rateEvidence),
      rateEvidenceDigest: pricing.rateEvidence.evidenceDigest,
    }),
    budgetPolicyRef: grant.policy.budget.budgetPolicyRef,
    budgetGeneration: grant.policy.budget.generation,
    maximumSpendPerInvocationUnits: maximum.units,
    balanceLedgerAccountRef,
    balanceVersion: balance?.version ?? 0,
    balanceChecksum: balance?.checksum ?? canonicalDigest({ accountRef: authority.principal.ownerId, balanceUnits: '0' }),
    balanceUnits,
    ...(treasury === undefined ? {} : {
      treasuryCustodyRef: treasury.custodyRef,
      treasuryCustodyGeneration: treasury.custodyGeneration,
      treasuryVersion: treasury.version,
      treasuryEvidenceRef: treasury.lastObservationRef,
      treasurySpendableUnits: treasury.spendableUnits,
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
    ...(treasury === undefined ? {} : {
      treasury: { spendable: { currency: 'USDC', exponent: 6, units: treasury.spendableUnits } },
    }),
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
  },
  returns: inspectResult,
  handler: issueCommitmentHandler,
})

export const inspect = action({
  args: { ...principalAndSourceArgs, operationRef: v.string(), input: jsonObject },
  returns: inspectResult,
  handler: async (ctx, args): Promise<InspectResult> => await ctx.runMutation(
    internal.capabilityOperationCommitments.issueCommitment,
    args,
  ),
})

const invocationMaterial = v.union(v.object({
  operationRef: v.string(),
  input: jsonObject,
  decisionPrice: exactAud,
  commitmentRef: v.string(),
  evidenceDigest: v.string(),
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
