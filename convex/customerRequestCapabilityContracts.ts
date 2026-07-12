import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createCapabilityContractRegistry, defineCapabilityContract } from '@/modules/customer-request/public'
import { capabilityContractValue } from '@/modules/customer-request/runtime'

import { internalMutation, internalQuery, mutation, type MutationCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'

const registrationResult = v.union(
  v.object({ kind: v.literal('registered'), capabilityContractId: v.string(), contractDigest: v.string() }),
  v.object({ kind: v.literal('refused'), reason: v.union(v.literal('contract_invalid'), v.literal('contract_identity_conflict')) }),
)

export const register = mutation({
  args: { contract: capabilityContractValue },
  returns: v.union(
    registrationResult,
    v.object({ kind: v.literal('refused'), reason: v.literal('authorization_denied') }),
  ),
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority({ db: ctx.db as never, auth: ctx.auth }, 'register_capability_binding')
    if (authority.kind !== 'allowed') return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    return await registerCapabilityContract(ctx.db, args.contract, Date.now())
  },
})

export const registerInternal = internalMutation({
  args: { contract: capabilityContractValue, registeredAt: v.number() },
  returns: registrationResult,
  handler: async (ctx, args) => await registerCapabilityContract(ctx.db, args.contract, args.registeredAt),
})

export async function registerCapabilityContract(
  db: MutationCtx['db'],
  input: Infer<typeof capabilityContractValue>,
  registeredAt: number,
) {
    let contract
    try { contract = defineCapabilityContract(input) } catch {
      return { kind: 'refused' as const, reason: 'contract_invalid' as const }
    }
    const contractDigest = canonicalDigest(contract)
    const existing = await db.query('customerRequestCapabilityContracts')
      .withIndex('by_capabilityContractId', (query) => query.eq('capabilityContractId', contract.capabilityContractId)).unique()
    if (existing !== null) return existing.contractDigest === contractDigest && existing.status === 'active'
      ? { kind: 'registered' as const, capabilityContractId: contract.capabilityContractId, contractDigest }
      : { kind: 'refused' as const, reason: 'contract_identity_conflict' as const }
    await db.insert('customerRequestCapabilityContracts', {
      ...writableContract(contract), contractDigest, status: 'active', registeredAt, updatedAt: registeredAt,
    })
    return { kind: 'registered' as const, capabilityContractId: contract.capabilityContractId, contractDigest }
}

export const listActiveInternal = internalQuery({
  args: {},
  returns: v.array(capabilityContractValue),
  handler: async (ctx) => {
    const rows = await ctx.db.query('customerRequestCapabilityContracts')
      .withIndex('by_status_and_capabilityContractId', (query) => query.eq('status', 'active')).take(257)
    if (rows.length > 256) throw new Error('capability_contract_limit_exceeded')
    const contracts = rows.map(({ _id, _creationTime, contractDigest, status, registeredAt, updatedAt, ...contract }) => contract)
    return createCapabilityContractRegistry(contracts).list().map(writableContract)
  },
})

function writableContract(contract: ReturnType<typeof defineCapabilityContract>): Infer<typeof capabilityContractValue> {
  return {
    capabilityContractId: contract.capabilityContractId, name: contract.name, operation: contract.operation,
    input: Object.fromEntries(Object.entries(contract.input).map(([field, definition]) => [field, writableField(definition)])),
    output: Object.fromEntries(Object.entries(contract.output).map(([field, definition]) => [field, writableField(definition)])),
    consequence: { ...contract.consequence },
    ...(contract.preparation === undefined ? {} : { preparation: { ...contract.preparation } }),
    ...(contract.applicability === undefined ? {} : { applicability: contract.applicability.map((item) => ({ field: item.field, acceptedValues: [...item.acceptedValues] })) }),
    ...(contract.providerAffinity === undefined ? {} : { providerAffinity: { ...contract.providerAffinity } }),
  }
}

function writableField(
  definition: ReturnType<typeof defineCapabilityContract>['input'][string],
): Infer<typeof capabilityContractValue>['input'][string] {
  return {
    valueType: definition.valueType, customerLabel: definition.customerLabel, required: definition.required,
    ...(definition.decisionRelevance === undefined ? {} : { decisionRelevance: definition.decisionRelevance }),
    ...(definition.disclosure === undefined ? {} : { disclosure: { ...definition.disclosure, purposes: [...definition.disclosure.purposes] } }),
    ...(definition.evidenceRole === undefined ? {} : { evidenceRole: definition.evidenceRole }),
  }
}
