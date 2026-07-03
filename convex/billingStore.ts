import type { RuntimeDb, RuntimeDocument } from './source_state'
import { brandNonEmpty } from '../src/modules/common/ids'
import type { AuditEventContract, RedactedPayload } from '../src/modules/observability/public'
import {
  BillingOfferStatusValues,
  BillingOperationStatusValues,
  BillingProviderEventStatusValues,
  BillingReconciliationStatusValues,
  BillingSupportStatusValues,
  createEmptyBillingSourceState,
} from '../src/modules/billing/public'
import type {
  BillingOffer,
  BillingOperation,
  BillingProviderEvent,
  BillingReceipt,
  BillingReconciliation,
  BillingSourceState,
  BillingSupportRecord,
} from '../src/modules/billing/public'

export async function loadOwnerBillingSlice(db: RuntimeDb, ownerId: string): Promise<BillingSourceState> {
  const businessRows = (await collect(db, 'businesses')).filter((row) => stringField(row, 'ownerId') === ownerId)
  return loadBillingStateForBusinesses(db, businessRows.map((row) => row._id))
}

export async function loadBillingBusinessSlice(db: RuntimeDb, businessId: string): Promise<BillingSourceState> {
  return loadBillingStateForBusinesses(db, [businessId])
}

export async function loadBillingOperationSlice(db: RuntimeDb, operationId: string): Promise<BillingSourceState> {
  const operation = (await collect(db, 'billingOperations')).find((row) => stringField(row, 'operationId') === operationId)
  if (operation === undefined) {
    return createEmptyBillingSourceState()
  }

  return loadBillingStateForBusinesses(db, [stringField(operation, 'businessId')])
}

export async function loadAdminBillingSlice(
  db: RuntimeDb,
  filter: { businessId?: string | undefined; operationId?: string | undefined } = {}
): Promise<BillingSourceState> {
  if (filter.operationId !== undefined && filter.operationId.trim().length > 0) {
    return loadBillingOperationSlice(db, filter.operationId.trim())
  }

  if (filter.businessId !== undefined && filter.businessId.trim().length > 0) {
    return loadBillingBusinessSlice(db, filter.businessId.trim())
  }

  const operations = await collect(db, 'billingOperations')
  const businessIds = uniqueNonEmptyBusinessIds(operations)
  if (businessIds.length === 0) {
    const offers = await collect(db, 'billingOffers')
    return loadBillingStateForBusinesses(db, uniqueNonEmptyBusinessIds(offers))
  }

  return loadBillingStateForBusinesses(db, businessIds)
}

export async function persistBillingSlice(
  db: RuntimeDb,
  state: BillingSourceState,
  auditEvents: readonly AuditEventContract[] = []
): Promise<void> {
  for (const offer of state.offers) {
    await upsertByFields(db, 'billingOffers', ['offerId'], {
      offerId: offer.id,
      businessId: offer.businessId,
      status: offer.status,
      publicName: offer.publicName,
      publicDescription: offer.publicDescription,
      publicCtaLabel: offer.publicCtaLabel,
      planId: offer.planId,
      provider: offer.provider,
      priceSummary: offer.priceSummary,
      termsSummary: offer.termsSummary,
      sourceHash: offer.sourceHash,
      updatedAt: offer.updatedAt,
    })
  }

  for (const operation of state.operations) {
    await upsertByFields(db, 'billingOperations', ['operationId'], {
      operationId: operation.id,
      ownerId: operation.ownerId,
      businessId: operation.businessId,
      offerId: operation.offerId,
      sourcePlanQuoteHash: operation.sourceHash,
      idempotencyKey: operation.operationKey,
      correlationId: operation.correlationId,
      operationKind: operation.operationKind,
      status: operation.status,
      providerFamily: operation.provider,
      providerCustomerId: operation.providerCustomerId,
      ...(operation.providerSessionId === undefined ? {} : { providerSessionId: operation.providerSessionId }),
      ...(operation.providerSubscriptionId === undefined ? {} : { providerSubscriptionId: operation.providerSubscriptionId }),
      sourceControlledReturnUrlKey: operation.returnPath,
      sourceControlledCancelUrlKey: operation.cancelPath,
      providerRefs: operation.providerRefs,
      ...(operation.checkoutUrl === undefined ? {} : { checkoutUrl: operation.checkoutUrl }),
      ...(operation.portalUrl === undefined ? {} : { portalUrl: operation.portalUrl }),
      receiptIds: operation.receiptIds,
      supportRecordIds: operation.supportRecordIds,
      evidenceRefs: operation.evidenceRefs,
      retryCount: operation.retryCount,
      ...(operation.retryAfter === undefined ? {} : { retryAfter: operation.retryAfter }),
      ...(operation.reason === undefined ? {} : { reason: operation.reason }),
      createdAt: operation.createdAt,
      updatedAt: operation.updatedAt,
    })
  }

  for (const event of state.providerEvents) {
    await upsertByFields(db, 'billingProviderEvents', ['provider', 'providerEventId'], {
      provider: event.provider,
      providerEventId: event.providerEventId,
      logicalProviderObjectKey: event.logicalProviderObjectKey,
      ...(event.operationId === undefined ? {} : { operationId: event.operationId }),
      ...(event.businessId === undefined ? {} : { businessId: event.businessId }),
      status: event.status,
      eventType: event.eventType,
      ...(event.providerCustomerId === undefined ? {} : { providerCustomerId: event.providerCustomerId }),
      ...(event.providerSubscriptionId === undefined ? {} : { providerSubscriptionId: event.providerSubscriptionId }),
      ...(event.providerSessionId === undefined ? {} : { providerSessionId: event.providerSessionId }),
      signatureStatus: event.signatureVerified ? 'verified' : 'unverified',
      normalizedFieldsJson: event.normalizedFieldsJson,
      payloadHash: event.payloadHash,
      redactedPayloadJson: event.redactedPayloadJson,
      retrievalStatus: event.retrievalStatus,
      correlationId: event.correlationId,
      receivedAt: event.receivedAt,
      ...(event.reason === undefined ? {} : { reason: event.reason }),
    })
  }

  for (const receipt of state.receipts) {
    await upsertByFields(db, 'billingReceipts', ['receiptId'], {
      receiptId: receipt.id,
      operationId: receipt.operationId,
      businessId: receipt.businessId,
      provider: receipt.provider,
      providerReceiptId: receipt.providerReceiptId,
      ...(receipt.invoiceUrl === undefined ? {} : { invoiceUrl: receipt.invoiceUrl }),
      ...(receipt.amountSummary === undefined ? {} : { amountSummary: receipt.amountSummary }),
      status: receipt.status,
      payloadHash: receipt.payloadHash,
      providerEvidenceRefs: [...receipt.providerEvidenceRefs],
      paidStateTransition: receipt.paidStateTransition,
      refundReversalDisputeRefs: [...receipt.refundReversalDisputeRefs],
      correlationId: receipt.correlationId,
      issuedAt: receipt.issuedAt,
      recordedAt: receipt.recordedAt,
    })
  }

  for (const reconciliation of state.reconciliations) {
    await upsertByFields(db, 'billingReconciliations', ['reconciliationId'], {
      reconciliationId: reconciliation.id,
      ...(reconciliation.operationId === undefined ? {} : { operationId: reconciliation.operationId }),
      businessId: reconciliation.businessId,
      status: reconciliation.status,
      provider: reconciliation.provider,
      retryCount: reconciliation.retryCount,
      ...(reconciliation.retryAfter === undefined ? {} : { retryAfter: reconciliation.retryAfter }),
      ...(reconciliation.actorRef === undefined ? {} : { actorRef: reconciliation.actorRef }),
      ...(reconciliation.reason === undefined ? {} : { reason: reconciliation.reason }),
      providerRefs: reconciliation.providerRefs,
      evidenceRefs: reconciliation.evidenceRefs,
      operatorNextAction: reconciliation.operatorNextAction,
      createdAt: reconciliation.createdAt,
      updatedAt: reconciliation.updatedAt,
    })
  }

  for (const support of state.supportRecords) {
    await upsertByFields(db, 'capabilityLaunchSupportRecords', ['supportRecordId'], {
      supportRecordId: support.id,
      ...(support.operationId === undefined ? {} : { operationId: support.operationId }),
      businessId: support.businessId,
      ...(support.capability === undefined ? {} : { capability: support.capability }),
      status: support.status,
      reason: support.reason,
      evidenceRefs: support.evidenceRefs,
      ...(support.primaryOwnerRef === undefined ? {} : { primaryOwnerRef: support.primaryOwnerRef }),
      ...(support.primaryAdminOperatorRef === undefined ? {} : { primaryAdminOperatorRef: support.primaryAdminOperatorRef }),
      ...(support.backupOwnerRef === undefined ? {} : { backupOwnerRef: support.backupOwnerRef }),
      ...(support.backupAdminOperatorRef === undefined ? {} : { backupAdminOperatorRef: support.backupAdminOperatorRef }),
      ...(support.supportedStage === undefined ? {} : { supportedStage: support.supportedStage }),
      ...(support.supportedChannels === undefined ? {} : { supportedChannels: [...support.supportedChannels] }),
      ...(support.capacityThresholdJson === undefined ? {} : { capacityThresholdJson: support.capacityThresholdJson }),
      ...(support.backlogAgeThresholdMs === undefined ? {} : { backlogAgeThresholdMs: support.backlogAgeThresholdMs }),
      ...(support.phaseIncidentCountsJson === undefined ? {} : { phaseIncidentCountsJson: support.phaseIncidentCountsJson }),
      ...(support.supportEscalationPath === undefined ? {} : { supportEscalationPath: support.supportEscalationPath }),
      ...(support.claimDisablePath === undefined ? {} : { claimDisablePath: support.claimDisablePath }),
      ...(support.perChannelKillRulesJson === undefined ? {} : { perChannelKillRulesJson: support.perChannelKillRulesJson }),
      ...(support.sourceHash === undefined ? {} : { sourceHash: support.sourceHash }),
      ...(support.correlationId === undefined ? {} : { correlationId: support.correlationId }),
      ...(support.lastReviewedAt === undefined ? {} : { lastReviewedAt: support.lastReviewedAt }),
      operatorNextAction: support.operatorNextAction ?? 'none',
      createdAt: support.createdAt,
      updatedAt: support.updatedAt,
    })
  }

  for (const event of auditEvents) {
    await upsertAuditEvent(db, event)
    await upsertByFields(db, 'operationKeys', ['scope', 'key'], {
      scope: 'billing',
      actorKind: event.actorKind,
      actorRef: event.actorRef,
      operationName: billingOperationName(event.eventType),
      key: event.idempotencyKey,
      requestHash: event.payloadHash,
      sourceHash: event.targetRef,
      status: 'succeeded',
      resultHash: event.payloadHash,
      effectRefs: [`target:${event.targetRef}`, ...event.evidenceRefs],
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    })
  }
}

async function loadBillingStateForBusinesses(db: RuntimeDb, businessIds: readonly string[]): Promise<BillingSourceState> {
  const businessIdSet = new Set(businessIds)
  if (businessIdSet.size === 0) {
    return createEmptyBillingSourceState()
  }

  const [offers, operations, providerEvents, receipts, reconciliations, supportRecords] = await Promise.all([
    collect(db, 'billingOffers'),
    collect(db, 'billingOperations'),
    collect(db, 'billingProviderEvents'),
    collect(db, 'billingReceipts'),
    collect(db, 'billingReconciliations'),
    collect(db, 'capabilityLaunchSupportRecords'),
  ])

  return createEmptyBillingSourceState(filterBillingStateRows({ offers, operations, providerEvents, receipts, reconciliations, supportRecords }, businessIdSet))
}

function toBillingOffer(row: RuntimeDocument): BillingOffer {
  const status = literalField(row, 'status', BillingOfferStatusValues, 'disabled')
  return {
    id: brandNonEmpty(stringField(row, 'offerId'), 'BillingOfferId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    status,
    publicName: stringField(row, 'publicName'),
    publicDescription: stringField(row, 'publicDescription'),
    publicCtaLabel: stringField(row, 'publicCtaLabel'),
    planId: stringField(row, 'planId'),
    provider: 'autumn_cloud',
    priceSummary: stringField(row, 'priceSummary'),
    termsSummary: stringField(row, 'termsSummary'),
    sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toBillingOperation(row: RuntimeDocument): BillingOperation {
  return {
    id: brandNonEmpty(stringField(row, 'operationId'), 'BillingOperationId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    ownerId: brandNonEmpty(stringField(row, 'ownerId'), 'OwnerId'),
    offerId: brandNonEmpty(stringField(row, 'offerId'), 'BillingOfferId'),
    operationKey: brandNonEmpty(stringField(row, 'idempotencyKey'), 'OperationKey'),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    operationKind: literalField(row, 'operationKind', ['checkout', 'portal'] as const, 'checkout'),
    provider: 'autumn_cloud',
    status: literalField(row, 'status', BillingOperationStatusValues, 'provider_unavailable'),
    providerCustomerId: stringField(row, 'providerCustomerId'),
    ...(optionalStringField(row, 'providerSessionId') === undefined ? {} : { providerSessionId: stringField(row, 'providerSessionId') }),
    ...(optionalStringField(row, 'providerSubscriptionId') === undefined
      ? {}
      : { providerSubscriptionId: stringField(row, 'providerSubscriptionId') }),
    providerRefs: readArray(row.providerRefs),
    ...(optionalStringField(row, 'checkoutUrl') === undefined ? {} : { checkoutUrl: stringField(row, 'checkoutUrl') }),
    ...(optionalStringField(row, 'portalUrl') === undefined ? {} : { portalUrl: stringField(row, 'portalUrl') }),
    receiptIds: readStringArray(row.receiptIds).map((id) => brandNonEmpty(id, 'BillingReceiptId')),
    supportRecordIds: readStringArray(row.supportRecordIds).map((id) => brandNonEmpty(id, 'BillingSupportRecordId')),
    returnPath: stringField(row, 'sourceControlledReturnUrlKey'),
    cancelPath: stringField(row, 'sourceControlledCancelUrlKey'),
    retryCount: numberField(row, 'retryCount'),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    evidenceRefs: readStringArray(row.evidenceRefs),
    sourceHash: brandNonEmpty(stringField(row, 'sourcePlanQuoteHash'), 'SourceHash'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toBillingProviderEvent(row: RuntimeDocument): BillingProviderEvent {
  return {
    id: brandNonEmpty(`billing_provider_event:${stringField(row, 'provider')}:${stringField(row, 'providerEventId')}`, 'BillingProviderEventId'),
    provider: stringField(row, 'provider') === 'stripe_psp' ? 'stripe_psp' : 'autumn_cloud',
    providerEventId: stringField(row, 'providerEventId'),
    logicalProviderObjectKey: stringField(row, 'logicalProviderObjectKey'),
    status: literalField(row, 'status', BillingProviderEventStatusValues, 'held_for_operator'),
    eventType: stringField(row, 'eventType'),
    ...(optionalStringField(row, 'providerCustomerId') === undefined ? {} : { providerCustomerId: stringField(row, 'providerCustomerId') }),
    ...(optionalStringField(row, 'providerSubscriptionId') === undefined
      ? {}
      : { providerSubscriptionId: stringField(row, 'providerSubscriptionId') }),
    ...(optionalStringField(row, 'providerSessionId') === undefined ? {} : { providerSessionId: stringField(row, 'providerSessionId') }),
    ...(optionalStringField(row, 'operationId') === undefined
      ? {}
      : { operationId: brandNonEmpty(stringField(row, 'operationId'), 'BillingOperationId') }),
    ...(optionalStringField(row, 'businessId') === undefined ? {} : { businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId') }),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    redactedPayloadJson: stringField(row, 'redactedPayloadJson'),
    normalizedFieldsJson: stringField(row, 'normalizedFieldsJson'),
    retrievalStatus: literalField(row, 'retrievalStatus', ['not_required', 'retrieved', 'failed'] as const, 'not_required'),
    signatureVerified: stringField(row, 'signatureStatus') === 'verified',
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    receivedAt: numberField(row, 'receivedAt'),
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
  }
}

function toBillingReceipt(row: RuntimeDocument): BillingReceipt {
  return {
    id: brandNonEmpty(stringField(row, 'receiptId'), 'BillingReceiptId'),
    operationId: brandNonEmpty(stringField(row, 'operationId'), 'BillingOperationId'),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    provider: stringField(row, 'provider') === 'autumn_cloud' ? 'autumn_cloud' : 'stripe_psp',
    providerReceiptId: stringField(row, 'providerReceiptId'),
    ...(optionalStringField(row, 'invoiceUrl') === undefined ? {} : { invoiceUrl: stringField(row, 'invoiceUrl') }),
    ...(optionalStringField(row, 'amountSummary') === undefined ? {} : { amountSummary: stringField(row, 'amountSummary') }),
    status: literalField(row, 'status', ['paid', 'refunded', 'disputed', 'chargeback'] as const, 'paid'),
    payloadHash: brandNonEmpty(stringField(row, 'payloadHash'), 'SourceHash'),
    providerEvidenceRefs: readStringArray(row.providerEvidenceRefs),
    paidStateTransition: stringField(row, 'paidStateTransition'),
    refundReversalDisputeRefs: readStringArray(row.refundReversalDisputeRefs),
    correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId'),
    issuedAt: numberField(row, 'issuedAt'),
    recordedAt: numberField(row, 'recordedAt'),
  }
}

function toBillingReconciliation(row: RuntimeDocument): BillingReconciliation {
  return {
    id: brandNonEmpty(stringField(row, 'reconciliationId'), 'BillingReconciliationId'),
    ...(optionalStringField(row, 'operationId') === undefined
      ? {}
      : { operationId: brandNonEmpty(stringField(row, 'operationId'), 'BillingOperationId') }),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    status: literalField(row, 'status', BillingReconciliationStatusValues, 'missing'),
    provider: stringField(row, 'provider') === 'stripe_psp' ? 'stripe_psp' : 'autumn_cloud',
    retryCount: numberField(row, 'retryCount'),
    ...(optionalNumberField(row, 'retryAfter') === undefined ? {} : { retryAfter: numberField(row, 'retryAfter') }),
    ...(optionalStringField(row, 'actorRef') === undefined ? {} : { actorRef: stringField(row, 'actorRef') }),
    ...(optionalStringField(row, 'reason') === undefined ? {} : { reason: stringField(row, 'reason') }),
    providerRefs: readArray(row.providerRefs),
    evidenceRefs: readStringArray(row.evidenceRefs),
    operatorNextAction: stringField(row, 'operatorNextAction'),
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

function toBillingSupportRecord(row: RuntimeDocument): BillingSupportRecord {
  return {
    id: brandNonEmpty(stringField(row, 'supportRecordId'), 'BillingSupportRecordId'),
    ...(optionalStringField(row, 'operationId') === undefined
      ? {}
      : { operationId: brandNonEmpty(stringField(row, 'operationId'), 'BillingOperationId') }),
    businessId: brandNonEmpty(stringField(row, 'businessId'), 'BusinessId'),
    capability: 'paid_activation_money_rails',
    status: literalField(row, 'status', BillingSupportStatusValues, 'open'),
    reason: stringField(row, 'reason'),
    evidenceRefs: readStringArray(row.evidenceRefs),
    ...(optionalStringField(row, 'claimDisablePath') === undefined ? {} : { claimDisablePath: stringField(row, 'claimDisablePath') }),
    ...(optionalStringField(row, 'perChannelKillRulesJson') === undefined
      ? {}
      : { perChannelKillRulesJson: stringField(row, 'perChannelKillRulesJson') }),
    ...(optionalStringField(row, 'sourceHash') === undefined ? {} : { sourceHash: brandNonEmpty(stringField(row, 'sourceHash'), 'SourceHash') }),
    ...(optionalStringField(row, 'correlationId') === undefined
      ? {}
      : { correlationId: brandNonEmpty(stringField(row, 'correlationId'), 'CorrelationId') }),
    operatorNextAction: stringField(row, 'operatorNextAction') || 'none',
    createdAt: numberField(row, 'createdAt'),
    updatedAt: numberField(row, 'updatedAt'),
  }
}

async function upsertAuditEvent(db: RuntimeDb, event: AuditEventContract): Promise<void> {
  await upsertByFields(db, 'auditEvents', ['eventId'], {
    eventId: event.eventId,
    eventType: event.eventType,
    actorKind: event.actorKind,
    actorRef: event.actorRef,
    targetType: event.targetType,
    targetRef: event.targetRef,
    ...(event.businessId === undefined ? {} : { businessId: event.businessId }),
    beforeState: event.beforeState,
    afterState: event.afterState,
    idempotencyKey: event.idempotencyKey,
    correlationId: event.correlationId,
    ...(event.reasonCode === undefined ? {} : { reasonCode: event.reasonCode }),
    evidenceRefs: event.evidenceRefs,
    redactedPayloadJson: JSON.stringify(event.redactedPayload satisfies RedactedPayload),
    payloadHash: event.payloadHash,
    createdAt: event.createdAt,
  })
}

async function upsertByFields(
  db: RuntimeDb,
  tableName: string,
  fields: readonly string[],
  value: Record<string, unknown>
): Promise<void> {
  const existing = (await collect(db, tableName)).find((row) => fields.every((field) => row[field] === value[field]))
  if (existing === undefined) {
    await db.insert(tableName, value)
    return
  }

  await db.patch(existing._id, value)
}

async function collect(db: Pick<RuntimeDb, 'query'>, tableName: string): Promise<RuntimeDocument[]> {
  return db.query(tableName).collect()
}

function billingOperationName(eventType: string): string {
  if (eventType === 'billing.checkout_started') return 'startPaidActivation'
  if (eventType === 'billing.portal_started') return 'startCustomerPortal'
  if (eventType === 'billing.return_recorded' || eventType === 'billing.cancel_returned') return 'recordBillingReturn'
  if (eventType.startsWith('billing.provider_event')) return 'ingestBillingProviderEvent'
  if (eventType.startsWith('billing.reconciliation')) return 'reconcileBillingOperation'
  if (eventType === 'billing.no_repair_marked') return 'markBillingNoRepair'
  return 'billingOperation'
}

function literalField<const Values extends readonly string[]>(
  row: RuntimeDocument,
  field: string,
  values: Values,
  fallback: Values[number]
): Values[number] {
  const value = stringField(row, field)
  return values.includes(value) ? value : fallback
}

function stringField(row: RuntimeDocument, field: string): string {
  const value = row[field]
  return typeof value === 'string' ? value : ''
}

function optionalStringField(row: RuntimeDocument, field: string): string | undefined {
  const value = row[field]
  return typeof value === 'string' ? value : undefined
}

function numberField(row: RuntimeDocument, field: string): number {
  const value = row[field]
  return typeof value === 'number' ? value : 0
}

function optionalNumberField(row: RuntimeDocument, field: string): number | undefined {
  const value = row[field]
  return typeof value === 'number' ? value : undefined
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readArray<Value>(value: unknown): Value[] {
  return Array.isArray(value) ? (value as Value[]) : []
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function uniqueNonEmptyBusinessIds(rows: readonly RuntimeDocument[]): string[] {
  const ids: string[] = []
  for (const row of rows) {
    const businessId = stringField(row, 'businessId')
    if (businessId.length > 0) {
      ids.push(businessId)
    }
  }
  return unique(ids)
}

function filterBillingStateRows(
  rows: {
    offers: readonly RuntimeDocument[]
    operations: readonly RuntimeDocument[]
    providerEvents: readonly RuntimeDocument[]
    receipts: readonly RuntimeDocument[]
    reconciliations: readonly RuntimeDocument[]
    supportRecords: readonly RuntimeDocument[]
  },
  businessIdSet: ReadonlySet<string>
): BillingSourceState {
  const state = createEmptyBillingSourceState()
  for (const row of rows.offers) {
    if (businessIdSet.has(stringField(row, 'businessId'))) {
      state.offers.push(toBillingOffer(row))
    }
  }
  for (const row of rows.operations) {
    if (businessIdSet.has(stringField(row, 'businessId'))) {
      state.operations.push(toBillingOperation(row))
    }
  }
  for (const row of rows.providerEvents) {
    if (businessIdSet.has(optionalStringField(row, 'businessId') ?? '')) {
      state.providerEvents.push(toBillingProviderEvent(row))
    }
  }
  for (const row of rows.receipts) {
    if (businessIdSet.has(stringField(row, 'businessId'))) {
      state.receipts.push(toBillingReceipt(row))
    }
  }
  for (const row of rows.reconciliations) {
    if (businessIdSet.has(stringField(row, 'businessId'))) {
      state.reconciliations.push(toBillingReconciliation(row))
    }
  }
  for (const row of rows.supportRecords) {
    if (businessIdSet.has(stringField(row, 'businessId')) && optionalStringField(row, 'capability') === 'paid_activation_money_rails') {
      state.supportRecords.push(toBillingSupportRecord(row))
    }
  }
  return state
}
