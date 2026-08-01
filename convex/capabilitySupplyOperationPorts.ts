import type {
  CapabilityBindingRow,
  CapabilityOfferingRow,
  OperationLedgerPorts,
  OperationKeyRecord,
  SupplyAuditEventRow,
} from '@/modules/capability-supply/public'

import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

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
      return existing === null ? null : toAuditRow(existing)
    },
    insertAudit: async (row) => {
      await db.insert('auditEvents', {
        eventId: row.eventId,
        eventType: row.eventType,
        actorKind: row.actorKind,
        actorRef: row.actorRef,
        targetType: row.targetType,
        targetRef: row.targetRef,
        beforeState: row.beforeState,
        afterState: row.afterState,
        idempotencyKey: row.idempotencyKey,
        correlationId: row.correlationId,
        reasonCode: row.reasonCode,
        evidenceRefs: [...row.evidenceRefs],
        redactedPayloadJson: row.redactedPayloadJson,
        payloadHash: row.payloadHash,
        createdAt: row.createdAt,
      })
    },

    registerOffering: writers.registerOffering,
    registerBinding: writers.registerBinding,
    setEligibility: writers.setEligibility,

    loadOfferingByOfferingId: async (offeringId) => {
      const offering = await db.query('capabilityOfferings')
        .withIndex('by_offeringId', (query) => query.eq('offeringId', offeringId)).unique()
      return offering === null ? null : toOfferingRow(offering)
    },
    loadBindingByBindingId: async (bindingId) => {
      const binding = await db.query('capabilityTransportBindings')
        .withIndex('by_bindingId', (query) => query.eq('bindingId', bindingId)).unique()
      return binding === null ? null : toBindingRow(binding)
    },
    listAdmittedConformantBindings: async (offeringId, limit) => {
      const rows = await db.query('capabilityTransportBindings')
        .withIndex('by_offeringId_and_admission_and_conformance', (index) => (
          index.eq('offeringId', offeringId).eq('admission', 'admitted').eq('conformance', 'conformant')
        )).take(limit)
      return rows.map(toBindingRow)
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

function toAuditRow(doc: Doc<'auditEvents'>): SupplyAuditEventRow {
  return {
    eventId: doc.eventId,
    eventType: doc.eventType,
    actorKind: doc.actorKind,
    actorRef: doc.actorRef,
    targetType: doc.targetType,
    targetRef: doc.targetRef,
    ...(doc.beforeState === undefined ? {} : { beforeState: doc.beforeState }),
    ...(doc.afterState === undefined ? {} : { afterState: doc.afterState }),
    idempotencyKey: doc.idempotencyKey,
    correlationId: doc.correlationId,
    ...(doc.reasonCode === undefined ? {} : { reasonCode: doc.reasonCode }),
    evidenceRefs: doc.evidenceRefs,
    redactedPayloadJson: doc.redactedPayloadJson,
    payloadHash: doc.payloadHash,
    createdAt: doc.createdAt,
  }
}

function toOfferingRow(doc: Doc<'capabilityOfferings'>): CapabilityOfferingRow {
  return {
    offeringId: doc.offeringId,
    businessId: doc.businessId,
    networkId: doc.networkId,
    capabilityId: doc.capabilityId,
    version: doc.version,
    contractDigest: doc.contractDigest,
    ...(doc.origin === undefined ? {} : { origin: doc.origin }),
    presentation: doc.presentation,
    searchTerms: doc.searchTerms,
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    registrationHash: doc.registrationHash,
    status: doc.status,
    admissionEvidenceRefs: doc.admissionEvidenceRefs,
    eligibilityHash: doc.eligibilityHash,
    registeredAt: doc.registeredAt,
    updatedAt: doc.updatedAt,
  }
}

function toBindingRow(doc: Doc<'capabilityTransportBindings'>): CapabilityBindingRow {
  return {
    _id: doc._id,
    _creationTime: doc._creationTime,
    bindingId: doc.bindingId,
    offeringId: doc.offeringId,
    networkId: doc.networkId,
    capabilityId: doc.capabilityId,
    version: doc.version,
    contractDigest: doc.contractDigest,
    endpointUrl: doc.endpointUrl,
    credentialRef: doc.credentialRef,
    continuation: doc.continuation,
    cancellation: doc.cancellation,
    adapterId: doc.adapterId,
    configJson: doc.configJson,
    configDigest: doc.configDigest,
    registrationEvidenceRefs: doc.registrationEvidenceRefs,
    registrationHash: doc.registrationHash,
    admission: doc.admission,
    conformance: doc.conformance,
    admissionEvidenceRefs: doc.admissionEvidenceRefs,
    conformanceEvidenceRefs: doc.conformanceEvidenceRefs,
    eligibilityHash: doc.eligibilityHash,
    registeredAt: doc.registeredAt,
    updatedAt: doc.updatedAt,
  }
}
