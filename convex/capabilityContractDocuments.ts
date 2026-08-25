import { v } from 'convex/values'

import {
  decodeDurableCapabilityContract,
  encodeCapabilityContractDocumentJson,
  type DurableCapabilityContract,
} from '@/modules/capability-contract-registry/public'
import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { validateAuditEvent } from '@/modules/observability/public'

import { internalQuery, mutation, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveAdminAuthority } from './authz'
import { persistAuditEvent } from './securityShared'

const capabilityContractRefValue = v.object({
  capabilityId: v.string(),
  version: v.number(),
  contractDigest: v.string(),
})

const registrationResultValue = v.union(
  v.object({ kind: v.literal('registered'), ref: capabilityContractRefValue }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('contract_invalid'),
      v.literal('contract_too_large'),
      v.literal('contract_identity_conflict'),
      v.literal('contract_integrity_failure'),
      v.literal('operation_key_conflict'),
      v.literal('registration_context_invalid'),
    ),
  }),
)

const exactLookupResultValue = v.union(
  v.object({
    kind: v.literal('found'),
    ref: capabilityContractRefValue,
    documentJson: v.string(),
    registeredAt: v.number(),
  }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(v.literal('not_found'), v.literal('not_active'), v.literal('integrity_failure')),
  }),
)

export const register = mutation({
  args: {
    documentJson: v.string(),
    operationKey: v.string(),
    correlationId: v.string(),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
  },
  returns: v.union(
    registrationResultValue,
    v.object({ kind: v.literal('refused'), reason: v.literal('authorization_denied') }),
  ),
  handler: async (ctx, args) => {
    const authority = await resolveAdminAuthority(
      { db: ctx.db, auth: ctx.auth },
      'register_capability_contract',
    )
    if (authority.kind !== 'allowed') {
      return { kind: 'refused' as const, reason: 'authorization_denied' as const }
    }
    const registeredAt = Date.now()
    if (!validRegistrationContext(args)) {
      return { kind: 'refused' as const, reason: 'registration_context_invalid' as const }
    }
    let encoded
    try {
      encoded = encodeCapabilityContractDocumentJson(args.documentJson)
    } catch (error) {
      return invalidContractResult(error)
    }
    const actorRef = authority.membership.clerkUserId
    const requestHash = canonicalDigest({
      documentJson: encoded.documentJson,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
    })
    const existingOperation = await ctx.db.query('operationKeys')
      .withIndex('by_actor_operation_key', (query) => (
        query.eq('actorRef', actorRef).eq('operationName', 'registerCapabilityContract').eq('key', args.operationKey)
      ))
      .unique()
    if (existingOperation !== null) {
      if (existingOperation.requestHash !== requestHash) {
        return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
      }
      if (existingOperation.status === 'failed_terminal') {
        const retry = await registerCapabilityContractDocument(ctx.db, encoded.documentJson, registeredAt)
        return retry.kind === 'refused'
          ? retry
          : { kind: 'refused' as const, reason: 'contract_integrity_failure' as const }
      }
      if (existingOperation.status !== 'succeeded') {
        return { kind: 'refused' as const, reason: 'operation_key_conflict' as const }
      }
      const replay = await getActiveExactCapabilityContract(ctx.db, encoded.contract.ref)
      return replay.kind === 'found'
        ? { kind: 'registered' as const, ref: replay.ref }
        : { kind: 'refused' as const, reason: 'contract_integrity_failure' as const }
    }

    const [operationId, result] = await Promise.all([
      ctx.db.insert('operationKeys', {
        scope: 'capability_contract_registry',
        actorKind: 'admin',
        actorRef,
        operationName: 'registerCapabilityContract',
        key: args.operationKey,
        requestHash,
        status: 'in_progress',
        effectRefs: [],
        createdAt: registeredAt,
        updatedAt: registeredAt,
      }),
      registerCapabilityContractDocument(ctx.db, encoded.documentJson, registeredAt),
    ])
    if (result.kind === 'refused') {
      await ctx.db.patch(operationId, {
        status: 'failed_terminal',
        resultHash: canonicalDigest({ reason: result.reason }),
        updatedAt: registeredAt,
      })
      return result
    }
    const auditEventId = await ensureRegistrationAudit(ctx.db, {
      ref: result.ref,
      actorRef,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
      registeredAt,
    })
    await ctx.db.patch(operationId, {
      status: 'succeeded',
      resultHash: canonicalDigest(result.ref),
      effectRefs: [auditEventId],
      updatedAt: registeredAt,
    })
    return { kind: 'registered' as const, ref: result.ref }
  },
})

export const getActiveExactInternal = internalQuery({
  args: capabilityContractRefValue.fields,
  returns: exactLookupResultValue,
  handler: async (ctx, ref) => await getActiveExactCapabilityContract(ctx.db, ref),
})

export async function registerCapabilityContractDocument(
  db: MutationCtx['db'],
  documentJson: string,
  registeredAt: number,
) {
  let encoded
  try {
    encoded = encodeCapabilityContractDocumentJson(documentJson)
  } catch (error) {
    return invalidContractResult(error)
  }

  const existing = await db.query('capabilityContractDocuments')
    .withIndex('by_capabilityId_and_version', (query) => (
      query.eq('capabilityId', encoded.contract.ref.capabilityId).eq('version', encoded.contract.ref.version)
    ))
    .unique()
  if (existing !== null) {
    const decoded = decodeDurableCapabilityContract(toDurableRecord(existing))
    return decoded.kind === 'found'
      && sameCapabilityContractRef(decoded.contract.ref, encoded.contract.ref)
      && existing.documentJson === encoded.documentJson
      ? { kind: 'registered' as const, ref: encoded.contract.ref, created: false }
      : { kind: 'refused' as const, reason: 'contract_identity_conflict' as const }
  }

  await db.insert('capabilityContractDocuments', {
    capabilityId: encoded.contract.ref.capabilityId,
    version: encoded.contract.ref.version,
    contractDigest: encoded.contract.ref.contractDigest,
    documentJson: encoded.documentJson,
    status: 'active',
    registeredAt,
  })
  return { kind: 'registered' as const, ref: encoded.contract.ref, created: true }
}

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
  } catch {
    return { kind: 'unavailable' as const, reason: 'integrity_failure' as const }
  }
}

function toDurableRecord(input: {
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

function validRegistrationContext(input: {
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: readonly string[]
}): boolean {
  return input.operationKey.trim() !== ''
    && input.correlationId.trim() !== ''
    && input.reasonCode.trim() !== ''
    && input.evidenceRefs.length > 0
    && input.evidenceRefs.every((reference) => reference.trim() !== '')
}

function invalidContractResult(error: unknown) {
  return {
    kind: 'refused' as const,
    reason: error instanceof Error && error.message === 'capability_contract_too_large'
      ? 'contract_too_large' as const
      : 'contract_invalid' as const,
  }
}

async function ensureRegistrationAudit(
  db: MutationCtx['db'],
  input: Readonly<{
    ref: Readonly<{ capabilityId: string; version: number; contractDigest: string }>
    actorRef: string
    operationKey: string
    correlationId: string
    reasonCode: string
    evidenceRefs: readonly string[]
    registeredAt: number
  }>,
): Promise<string> {
  const targetRef = `${input.ref.capabilityId}@${input.ref.version}#${input.ref.contractDigest}`
  const redactedPayload = {
    capabilityId: input.ref.capabilityId,
    version: input.ref.version,
    contractDigest: input.ref.contractDigest,
  }
  const validation = validateAuditEvent({
    eventId: brandNonEmpty(
      `audit:capability_contract:${canonicalDigest({
        targetType: 'capability_contract',
        targetRef,
        actorKind: 'admin',
        actorRef: input.actorRef,
        operationKey: input.operationKey,
      })}`,
      'AuditEventId',
    ),
    eventType: 'capability_contract.registered',
    actorKind: 'admin',
    actorRef: input.actorRef,
    targetType: 'capability_contract',
    targetRef,
    beforeState: 'unregistered',
    afterState: 'active',
    idempotencyKey: brandNonEmpty(input.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(input.correlationId, 'CorrelationId'),
    reasonCode: input.reasonCode,
    evidenceRefs: input.evidenceRefs,
    redactedPayload,
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: input.registeredAt,
  })

  if (!validation.valid) {
    throw new Error('capability_contract_audit_invalid')
  }

  await persistAuditEvent(db, validation.event)
  return validation.event.eventId
}
