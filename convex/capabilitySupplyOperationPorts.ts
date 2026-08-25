import type {
  OperationLedgerPorts,
  OperationKeyRecord,
} from '@/modules/capability-supply/public'
import type { AuditEventContract, RedactedPayload } from '../src/modules/observability/public'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { toCapabilityBindingRow, toCapabilityOfferingRow } from './capabilitySupplyRowMappers'
import { persistAuditEvent } from './securityShared'

export function capabilitySupplyOperationPorts(
  db: MutationCtx['db'],
  writers: Pick<OperationLedgerPorts, 'registerOffering' | 'registerBinding' | 'setEligibility'>,
): OperationLedgerPorts {
  return {
    findOperationKey: async (input) => {
      const existing = await db.query('operationKeys')
        .withIndex('by_actor_operation_key', (query) => (
          query.eq('actorRef', input.actorRef)
            .eq('operationName', input.operationName)
            .eq('key', input.key)
        )).unique()
      return existing === null ? null : toOperationKeyRecord(existing)
    },
    insertOperationKey: async (input) => {
      const operationId = await db.insert('operationKeys', {
        scope: input.scope,
        actorKind: input.actorKind,
        actorRef: input.actorRef,
        operationName: input.operationName,
        key: input.key,
        requestHash: input.requestHash,
        status: 'in_progress',
        effectRefs: [],
        createdAt: input.now,
        updatedAt: input.now,
      })
      return operationId
    },
    markOperationInProgress: async (operationId, now) => {
      await db.patch(operationId as Id<'operationKeys'>, { status: 'in_progress', updatedAt: now })
    },
    markOperationFailed: async (operationId, resultHash, now) => {
      await db.patch(operationId as Id<'operationKeys'>, {
        status: 'failed_terminal', resultHash, updatedAt: now,
      })
    },
    markOperationSucceeded: async (operationId, resultHash, effectRefs, now) => {
      await db.patch(operationId as Id<'operationKeys'>, {
        status: 'succeeded', resultHash, effectRefs: [...effectRefs], updatedAt: now,
      })
    },

    findAuditByEventId: async (eventId) => {
      const existing = await db.query('auditEvents')
        .withIndex('by_eventId', (query) => query.eq('eventId', eventId)).unique()
      if (existing === null) return null
      return {
        eventId: existing.eventId,
        eventType: existing.eventType,
        actorKind: existing.actorKind,
        actorRef: existing.actorRef,
        targetType: existing.targetType,
        targetRef: existing.targetRef,
        ...(existing.beforeState === undefined ? {} : { beforeState: existing.beforeState }),
        ...(existing.afterState === undefined ? {} : { afterState: existing.afterState }),
        idempotencyKey: existing.idempotencyKey,
        correlationId: existing.correlationId,
        ...(existing.reasonCode === undefined ? {} : { reasonCode: existing.reasonCode }),
        evidenceRefs: existing.evidenceRefs,
        redactedPayloadJson: existing.redactedPayloadJson,
        payloadHash: existing.payloadHash,
        createdAt: existing.createdAt,
      }
    },
    insertAudit: async (row) => {
      await persistAuditEvent(db, {
        eventId: row.eventId as AuditEventContract['eventId'],
        eventType: row.eventType as AuditEventContract['eventType'],
        actorKind: row.actorKind as AuditEventContract['actorKind'],
        actorRef: row.actorRef,
        targetType: row.targetType as AuditEventContract['targetType'],
        targetRef: row.targetRef,
        beforeState: row.beforeState,
        afterState: row.afterState,
        idempotencyKey: row.idempotencyKey as AuditEventContract['idempotencyKey'],
        correlationId: row.correlationId as AuditEventContract['correlationId'],
        reasonCode: row.reasonCode,
        evidenceRefs: [...row.evidenceRefs],
        redactedPayload: JSON.parse(row.redactedPayloadJson) as RedactedPayload,
        payloadHash: row.payloadHash as AuditEventContract['payloadHash'],
        createdAt: row.createdAt,
      })
    },

    registerOffering: writers.registerOffering,
    registerBinding: writers.registerBinding,
    setEligibility: writers.setEligibility,

    loadOfferingByOfferingId: async (offeringId) => {
      const offering = await db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId)).unique()
      return offering === null ? null : toCapabilityOfferingRow(offering)
    },
    loadBindingByBindingId: async (bindingId) => {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
      return binding === null ? null : toCapabilityBindingRow(binding)
    },
    listAdmittedConformantBindings: async (offeringId, limit) => {
      const rows = await db.query('capabilityTransportBindings')
        .withIndex('by_offeringId_and_admission_and_conformance', (index) => (
          index.eq('offeringId', offeringId).eq('admission', 'admitted').eq('conformance', 'conformant')
        )).take(limit)
      return rows.map(toCapabilityBindingRow)
    },
    patchOfferingQuarantineParent: async (offeringId, patch) => {
      const offering = await db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId)).unique()
      if (offering === null) throw new Error('capability_supply_operation_integrity_failure')
      await db.patch(offering._id, {
        status: patch.status,
        admissionEvidenceRefs: [...patch.admissionEvidenceRefs],
        eligibilityHash: patch.eligibilityHash,
        updatedAt: patch.updatedAt,
      })
    },
    patchBindingQuarantine: async (bindingId, patch) => {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
      if (binding === null) throw new Error('capability_supply_operation_integrity_failure')
      await db.patch(binding._id, {
        admission: patch.admission,
        conformance: patch.conformance,
        admissionEvidenceRefs: [...patch.admissionEvidenceRefs],
        conformanceEvidenceRefs: [...patch.conformanceEvidenceRefs],
        eligibilityHash: patch.eligibilityHash,
        updatedAt: patch.updatedAt,
      })
    },
  }
}

function toOperationKeyRecord(doc: Doc<'operationKeys'>): OperationKeyRecord {
  return {
    operationId: doc._id,
    requestHash: doc.requestHash,
    status: doc.status as OperationKeyRecord['status'],
    ...(doc.resultHash === undefined ? {} : { resultHash: doc.resultHash }),
    effectRefs: doc.effectRefs,
  }
}
