import {
  createPreparationDisclosureAllocation,
  type PreparationDisclosureAllocation,
  type PreparationDisclosureStore,
  type VerifiedPreparationAuthority,
} from '@/modules/customer-request/preparation-authority'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type Context = Pick<ActionCtx, 'runQuery' | 'runMutation'>

export function createConvexPreparationDisclosureStore(ctx: Context): PreparationDisclosureStore {
  return {
    allocate: async (input) => {
      const allocation = createPreparationDisclosureAllocation(input.authority, input.command, input.now)
      const result = await ctx.runMutation(internal.customerRequestPreparationAuthority.allocate, {
        allocationId: allocation.allocationId,
        operationKey: allocation.operationKey,
        authorityUseKey: allocation.authorityUseKey,
        allocationDigest: allocation.allocationDigest,
        authorityId: allocation.authorityId,
        authorityVersion: allocation.authorityVersion,
        authorityDigest: allocation.authorityDigest,
        requestId: allocation.requestId,
        requestRevision: allocation.requestRevision,
        planRevisionId: allocation.planRevisionId,
        actionId: allocation.actionId,
        capabilityContractId: allocation.capabilityContractId,
        recipient: { ...allocation.recipient },
        purpose: allocation.purpose,
        purposeLabel: allocation.purposeLabel,
        fields: [...allocation.fields],
        fieldCategories: allocation.fieldCategories.map((item) => ({ ...item })),
        allocatedAt: allocation.allocatedAt,
      })
      if (result.kind === 'refused') return result
      const stored = await ctx.runQuery(internal.customerRequestPreparationAuthority.getAllocation, {
        allocationId: result.allocationId,
      })
      if (stored === null) throw new Error('preparation_allocation_missing')
      return { kind: 'allocated', allocation: normalizeAllocation(stored) }
    },
    resolve: async (input) => normalizeAllocation(await ctx.runMutation(
      internal.customerRequestPreparationAuthority.resolve,
      input,
    )),
    authorizeRelease: async (input) => {
      const result = await ctx.runQuery(internal.customerRequestPreparationAuthority.authorizeRelease, input)
      return result.kind === 'refused'
        ? result
        : { kind: 'authorized', allocation: normalizeAllocation(result.allocation) }
    },
  }
}

export async function recordConvexVerifiedPreparationAuthority(
  ctx: Pick<ActionCtx, 'runMutation'>,
  authority: VerifiedPreparationAuthority,
  recordedAt: number,
): Promise<void> {
  await ctx.runMutation(internal.customerRequestPreparationAuthority.recordAuthority, {
    authority: {
      ...authority,
      permittedFields: [...authority.permittedFields],
      permittedRecipientKinds: [...authority.permittedRecipientKinds],
      permittedRecipientBindingIds: [...authority.permittedRecipientBindingIds],
      permittedPurposes: [...authority.permittedPurposes],
    },
    recordedAt,
  })
}

export async function listConvexPreparationDisclosureActivity(
  ctx: Pick<ActionCtx, 'runQuery'>,
  input: Readonly<{ requestId: string; requestRevision: number; limit?: number }>,
) {
  return await ctx.runQuery(internal.customerRequestPreparationAuthority.listRequestDisclosureActivity, {
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    limit: input.limit ?? 50,
  })
}

function normalizeAllocation(input: Readonly<{
  allocationId: string; operationKey: string; authorityUseKey: string; allocationDigest: string
  authorityId: string; authorityVersion: number; authorityDigest: string
  requestId: string; requestRevision: number; planRevisionId: string; actionId: string; capabilityContractId: string
  recipient: PreparationDisclosureAllocation['recipient']; purpose: string; purposeLabel: string; fields: string[]
  fieldCategories: { field: string; label: string }[]
  disposition: PreparationDisclosureAllocation['disposition']; allocatedAt: number
  resolvedAt?: number; providerEvidenceRef?: string
}>): PreparationDisclosureAllocation {
  return {
    ...input,
    recipient: { ...input.recipient },
    fields: [...input.fields],
    fieldCategories: input.fieldCategories.map((item) => ({ ...item })),
  }
}
