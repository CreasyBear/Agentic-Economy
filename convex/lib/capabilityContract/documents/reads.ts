import { v } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import {
  decodeDurableCapabilityContract,
  encodeCapabilityContractDocumentJson,
  type DurableCapabilityContract,
} from '@/modules/capability-contract-registry/public'
import { sameCapabilityContractRef } from '@/modules/capability-contract/public'

import type { QueryCtx } from '../../../_generated/server'

export const capabilityContractRefValue = v.object({
  capabilityId: v.string(),
  version: v.number(),
  contractDigest: v.string(),
})


export async function getActiveExactCapabilityContract(
  db: QueryCtx['db'],
  ref: Readonly<{ capabilityId: string; version: number; contractDigest: string }>,
) {
  const existing = await db.query('capabilityContractDocuments')
    .withIndex('by_capabilityId_and_version', (query) => (
      query.eq('capabilityId', ref.capabilityId).eq('version', ref.version)
    ))
    .unique()
  if (existing === null) return { kind: 'unavailable' as const, reason: 'not_found' as const }

  const decoded = decodeDurableCapabilityContract(toDurableRecord(existing))
  if (decoded.kind === 'unavailable') return decoded
  if (!sameCapabilityContractRef(decoded.contract.ref, ref)) {
    return { kind: 'unavailable' as const, reason: 'not_found' as const }
  }
  return {
    kind: 'found' as const,
    ref: decoded.contract.ref,
    documentJson: existing.documentJson,
    registeredAt: existing.registeredAt,
  }
}

/** Reopens an immutable registered contract snapshot for post-release evidence validation. */
export async function getExactRegisteredCapabilityContract(
  db: QueryCtx['db'],
  ref: Readonly<{ capabilityId: string; version: number; contractDigest: string }>,
) {
  const existing = await db.query('capabilityContractDocuments')
    .withIndex('by_capabilityId_and_version', (query) => (
      query.eq('capabilityId', ref.capabilityId).eq('version', ref.version)
    ))
    .unique()
  if (existing === null) return { kind: 'unavailable' as const, reason: 'not_found' as const }
  try {
    const encoded = encodeCapabilityContractDocumentJson(existing.documentJson)
    if (!sameCapabilityContractRef(encoded.contract.ref, ref)
      || encoded.contract.ref.contractDigest !== existing.contractDigest) {
      return { kind: 'unavailable' as const, reason: 'integrity_failure' as const }
    }
    return { kind: 'found' as const, contract: encoded.contract, registeredAt: existing.registeredAt }
  } catch (cause) {
    return degradeBackend(cause, { kind: 'unavailable' as const, reason: 'integrity_failure' as const }, { site: 'getExactRegisteredCapabilityContract', reason: 'invalid_response' })
  }
}

export function toDurableRecord(input: {
  capabilityId: string
  version: number
  contractDigest: string
  documentJson: string
  status: 'active' | 'retired'
  registeredAt: number
  retiredAt?: number
}): DurableCapabilityContract {
  return {
    ref: {
      capabilityId: input.capabilityId,
      version: input.version,
      contractDigest: input.contractDigest,
    },
    documentJson: input.documentJson,
    status: input.status,
    registeredAt: input.registeredAt,
    ...(input.retiredAt === undefined ? {} : { retiredAt: input.retiredAt }),
  }
}
