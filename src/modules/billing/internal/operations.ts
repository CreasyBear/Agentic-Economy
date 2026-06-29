import { brandNonEmpty } from '@/modules/common/ids'
import type {
  BillingOperationId,
  BillingProviderEventId,
  BillingReceiptId,
  BillingReconciliationId,
  BillingSupportRecordId,
  BusinessId,
  CorrelationId,
  OperationKey,
  OwnerId,
  SourceHash,
} from '@/modules/common/ids'
import { error, ok, type ModuleResult } from '@/modules/common/result'
import { stableHash } from '@/modules/common/stable-hash'
import type { ActorKind, AuditEventContract, AuditEventType, AuditTargetType } from '@/modules/observability/public'
import { validateAuditEvent } from '@/modules/observability/public'
import { requireBillingOperator, requireBillingOwner } from './authority'
import type {
  AutumnAttachReadback,
  AutumnCustomerReadback,
  AutumnProvider,
} from './provider-readback'
import type {
  BillingAdminAuthority,
  BillingOffer,
  BillingOperation,
  BillingOperationStatus,
  BillingOperatorControls,
  BillingProvider,
  BillingProviderEvent,
  BillingProviderRef,
  BillingReceipt,
  BillingReconciliation,
  BillingSourceState,
  BillingSupportRecord,
  BillingOwnerAuthority,
} from './schema'
import { defaultBillingOperatorControls } from './schema'

export type BillingStateResult<Code extends string, Payload extends object = Record<never, never>> = ModuleResult<
  Code,
  BillingErrorCode,
  Payload,
  BillingErrorPayload
>

export const BillingClientSuppliedFieldValues = [
  'amount',
  'currency',
  'customerId',
  'customer_id',
  'providerId',
  'providerCustomerId',
  'providerObjectId',
  'providerSessionId',
  'providerSubscriptionId',
  'providerReceiptId',
  'entitlement',
  'paidState',
  'returnUrl',
  'cancelUrl',
  'businessAuthority',
] as const

export type BillingErrorCode =
  | 'billing_owner_denied'
  | 'billing_operator_denied'
  | 'billing_control_disabled'
  | 'billing_offer_unavailable'
  | 'billing_client_field_rejected'
  | 'billing_provider_unavailable'
  | 'billing_operation_conflict'
  | 'billing_operation_not_found'
  | 'billing_event_rejected'
  | 'billing_reconciliation_unavailable'

export type BillingErrorPayload = {
  reason: string
  operationId?: BillingOperationId
  providerEventId?: string
}

export type StartPaidActivationCommand = {
  authority: BillingOwnerAuthority | undefined
  businessId: BusinessId
  ownerId: OwnerId
  offerId: BillingOffer['id']
  operationKey: OperationKey
  correlationId: CorrelationId
  appBaseUrl: string
  now: number
  unsafeClientFields?: Record<string, unknown>
}

export type StartPaidActivationResult = BillingStateResult<
  'billing_checkout_started' | 'billing_paid_without_redirect' | 'billing_required_action',
  { state: BillingSourceState; operation: BillingOperation; auditEvent: AuditEventContract }
>

export type StartCustomerPortalCommand = {
  authority: BillingOwnerAuthority | undefined
  businessId: BusinessId
  ownerId: OwnerId
  operationId: BillingOperationId
  operationKey: OperationKey
  correlationId: CorrelationId
  appBaseUrl: string
  now: number
  unsafeClientFields?: Record<string, unknown>
}

export type StartCustomerPortalResult = BillingStateResult<
  'billing_portal_started',
  { state: BillingSourceState; operation: BillingOperation; auditEvent: AuditEventContract }
>

export type BillingProviderEventCommand = {
  operationKey: OperationKey
  correlationId: CorrelationId
  provider: BillingProvider
  providerEventId: string
  eventType: string
  payloadHash: SourceHash
  redactedPayloadJson?: string
  signatureVerified: boolean
  receivedAt: number
  providerCustomerId?: string
  providerSessionId?: string
  providerSubscriptionId?: string
  operationId?: BillingOperationId
  planId?: string
  providerStatus?: 'active' | 'past_due' | 'payment_failed' | 'refunded' | 'disputed' | 'chargeback' | 'cancelled' | 'expired' | 'requires_action'
  receipt?: {
    providerReceiptId: string
    invoiceUrl?: string
    amountSummary?: string
    issuedAt: number
    status: BillingReceipt['status']
  }
}

export type BillingProviderEventResult = BillingStateResult<
  | 'billing_provider_event_ingested'
  | 'billing_provider_event_duplicate'
  | 'billing_provider_event_rejected'
  | 'billing_provider_event_held',
  { state: BillingSourceState; providerEvent: BillingProviderEvent; operation?: BillingOperation; auditEvent: AuditEventContract }
>

export type BillingReturnCommand = {
  authority: BillingOwnerAuthority | undefined
  businessId: BusinessId
  ownerId: OwnerId
  operationId: BillingOperationId
  operationKey: OperationKey
  correlationId: CorrelationId
  returnedPath: string
  now: number
}

export type BillingReturnResult = BillingStateResult<
  'billing_return_recorded' | 'billing_cancel_returned',
  { state: BillingSourceState; operation: BillingOperation; auditEvent: AuditEventContract }
>

export type BillingReconciliationCommand = {
  authority: BillingAdminAuthority | undefined
  businessId: BusinessId
  operationId: BillingOperationId
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type BillingReconciliationResult = BillingStateResult<
  'billing_reconciliation_matched' | 'billing_reconciliation_missing' | 'billing_reconciliation_mismatched',
  { state: BillingSourceState; reconciliation: BillingReconciliation; auditEvent: AuditEventContract }
>

export type BillingNoRepairCommand = {
  authority: BillingAdminAuthority | undefined
  businessId: BusinessId
  operationId?: BillingOperationId
  reconciliationId?: BillingReconciliationId
  reason: string
  evidenceRefs: readonly string[]
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type BillingNoRepairResult = BillingStateResult<
  'billing_no_repair_marked',
  { state: BillingSourceState; supportRecord: BillingSupportRecord; auditEvent: AuditEventContract }
>

export type BillingEvidenceSource = 'provider_readback' | 'route_smoke' | 'env'

export type RecordBillingEvidenceCommand = {
  authority: BillingAdminAuthority | undefined
  businessId: BusinessId
  provider: BillingProvider
  connectionStatus: 'ready' | 'unavailable'
  evidenceSource: BillingEvidenceSource
  providerObjectId?: string
  routeEvidenceRef?: string
  payloadHash?: SourceHash
  redactedPayloadJson?: string
  operatorNextAction: string
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type RecordBillingEvidenceResult = BillingStateResult<
  'billing_evidence_recorded',
  { state: BillingSourceState; supportRecord: BillingSupportRecord; auditEvent: AuditEventContract }
>

export type ReadBillingStatusCommand = {
  authority: BillingOwnerAuthority | undefined
  businessId: BusinessId
  ownerId: OwnerId
  operationId?: BillingOperationId
}

export type ReadBillingStatusResult = BillingStateResult<
  'billing_status_read',
  { status: BillingOperationStatus | 'not_started'; operation?: BillingOperation }
>

export type ReadReceiptCommand = {
  authority: BillingOwnerAuthority | undefined
  businessId: BusinessId
  ownerId: OwnerId
  receiptId: BillingReceiptId
}

export type ReadReceiptResult = BillingStateResult<'billing_receipt_read', { receipt: BillingReceipt }>

export type ReadBillingReconciliationCommand = {
  authority: BillingAdminAuthority | undefined
  businessId: BusinessId
  reconciliationId: BillingReconciliationId
}

export type ReadBillingReconciliationResult = BillingStateResult<
  'billing_reconciliation_read',
  { reconciliation: BillingReconciliation }
>

export type DisablePaidActivationCommand = {
  authority: BillingAdminAuthority | undefined
  businessId: BusinessId
  reason: string
  evidenceRefs: readonly string[]
  operationKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type DisablePaidActivationResult = BillingStateResult<
  'billing_paid_activation_disabled',
  { state: BillingSourceState; supportRecord: BillingSupportRecord; auditEvent: AuditEventContract }
>

export function createEmptyBillingSourceState(): BillingSourceState {
  return {
    offers: [],
    operations: [],
    providerEvents: [],
    receipts: [],
    reconciliations: [],
    supportRecords: [],
  }
}

export function upsertBillingOffer(state: BillingSourceState, offer: BillingOffer): BillingSourceState {
  return {
    ...state,
    offers: [...state.offers.filter((existing) => existing.id !== offer.id), offer],
  }
}

export async function startPaidActivation(
  state: BillingSourceState,
  command: StartPaidActivationCommand,
  provider: AutumnProvider,
  controls: BillingOperatorControls = defaultBillingOperatorControls
): Promise<StartPaidActivationResult> {
  const deniedClientField = findClientSuppliedField(command.unsafeClientFields)
  if (deniedClientField !== undefined) {
    return error('billing_client_field_rejected', false, { reason: deniedClientField })
  }

  const authority = requireBillingOwner(command.authority, command.businessId, controls)
  if (authority.kind === 'denied') {
    return error(authority.reason === 'control_disabled' ? 'billing_control_disabled' : 'billing_owner_denied', false, {
      reason: authority.reason,
    })
  }

  if (command.authority?.ownerId !== command.ownerId) {
    return error('billing_owner_denied', false, { reason: 'wrong_owner' })
  }

  const offer = state.offers.find(
    (candidate) => candidate.id === command.offerId && candidate.businessId === command.businessId && candidate.status === 'active'
  )
  if (offer === undefined) {
    return error('billing_offer_unavailable', false, { reason: 'active_offer_not_found' })
  }

  const requestHash = stableHash({
    businessId: command.businessId,
    offerId: command.offerId,
    ownerId: command.ownerId,
    providerCustomerId: providerCustomerIdFor(command.businessId, command.ownerId),
    planId: offer.planId,
  })
  const existing = state.operations.find((operation) => operation.operationKey === command.operationKey)
  if (existing !== undefined) {
    if (existing.sourceHash === requestHash) {
      const auditEvent = buildBillingAuditEvent({
        eventType: 'billing.checkout_started',
        actorKind: 'owner',
        actorRef: command.ownerId,
        targetType: 'billing',
        targetRef: existing.id,
        businessId: command.businessId,
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        beforeState: existing.status,
        afterState: existing.status,
        evidenceRefs: existing.evidenceRefs,
        payloadHash: requestHash,
        createdAt: command.now,
      })
      return ok('billing_checkout_started', { state, operation: existing, auditEvent })
    }

    return error('billing_operation_conflict', false, { reason: 'operation_key_conflict', operationId: existing.id })
  }

  const operationId = billingOperationId(command.businessId, command.offerId, command.operationKey)
  const providerCustomerId = providerCustomerIdFor(command.businessId, command.ownerId)
  const successUrl = ownerAbsoluteUrl(command.appBaseUrl, `/owner/billing/return/${operationId}`)
  const cancelPath = `/owner/billing/cancel/${operationId}`

  let attach: AutumnAttachReadback
  try {
    attach = await provider.attach({
      customerId: providerCustomerId,
      planId: offer.planId,
      successUrl,
      metadata: {
        ae_business_id: command.businessId,
        ae_operation_id: operationId,
        ae_offer_id: offer.id,
        ae_correlation_id: command.correlationId,
      },
    })
  } catch {
    return error('billing_provider_unavailable', true, { reason: 'autumn_attach_failed' })
  }

  const initialStatus: BillingOperationStatus = attach.requiredAction
    ? 'required_action'
    : attach.paymentUrl === null
      ? 'paid_active'
      : 'pending_provider_redirect'
  const providerRefs: BillingProviderRef[] = [
    { provider: 'autumn_cloud', objectId: attach.customerId, payloadHash: attach.payloadHash, readAt: command.now },
  ]
  const receiptIds: BillingReceiptId[] = []
  const receipts: BillingReceipt[] = []
  if (typeof attach.invoice?.hostedInvoiceUrl === 'string' && attach.invoice.status === 'paid') {
    const receiptId = billingReceiptId(operationId, attach.invoice.stripeId)
    receiptIds.push(receiptId)
    receipts.push({
      id: receiptId,
      operationId,
      businessId: command.businessId,
      provider: 'stripe_psp',
      providerReceiptId: attach.invoice.stripeId,
      invoiceUrl: attach.invoice.hostedInvoiceUrl,
      amountSummary: `${attach.invoice.total} ${attach.invoice.currency}`,
      status: 'paid',
      payloadHash: attach.payloadHash,
      providerEvidenceRefs: [`autumn:${attach.customerId}`, `stripe:${attach.invoice.stripeId}`, `hash:${attach.payloadHash}`],
      paidStateTransition: 'attach_invoice_paid',
      refundReversalDisputeRefs: [],
      correlationId: command.correlationId,
      issuedAt: command.now,
      recordedAt: command.now,
    })
  }

  const operation: BillingOperation = {
    id: operationId,
    businessId: command.businessId,
    ownerId: command.ownerId,
    offerId: offer.id,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    operationKind: 'checkout',
    provider: 'autumn_cloud',
    status: initialStatus,
    providerCustomerId,
    providerRefs,
    receiptIds,
    supportRecordIds: [],
    returnPath: `/owner/billing/return/${operationId}`,
    cancelPath,
    retryCount: 0,
    ...(attach.requiredAction?.reason === undefined ? {} : { reason: attach.requiredAction.reason }),
    evidenceRefs: [`autumn:${attach.customerId}`, `hash:${attach.payloadHash}`],
    sourceHash: requestHash,
    createdAt: command.now,
    updatedAt: command.now,
    ...(attach.paymentUrl === null ? {} : { checkoutUrl: attach.paymentUrl }),
  }

  const nextState = {
    ...state,
    operations: [...state.operations, operation],
    receipts: [...state.receipts, ...receipts],
  }
  const auditEvent = buildBillingAuditEvent({
    eventType: 'billing.checkout_started',
    actorKind: 'owner',
    actorRef: command.ownerId,
    targetType: 'billing',
    targetRef: operation.id,
    businessId: command.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: 'none',
    afterState: operation.status,
    evidenceRefs: operation.evidenceRefs,
    payloadHash: attach.payloadHash,
    createdAt: command.now,
  })

  if (initialStatus === 'paid_active') {
    return ok('billing_paid_without_redirect', { state: nextState, operation, auditEvent })
  }

  if (initialStatus === 'required_action') {
    return ok('billing_required_action', { state: nextState, operation, auditEvent })
  }

  return ok('billing_checkout_started', { state: nextState, operation, auditEvent })
}

export async function startCustomerPortal(
  state: BillingSourceState,
  command: StartCustomerPortalCommand,
  provider: AutumnProvider,
  controls: BillingOperatorControls = defaultBillingOperatorControls
): Promise<StartCustomerPortalResult> {
  const deniedClientField = findClientSuppliedField(command.unsafeClientFields)
  if (deniedClientField !== undefined) {
    return error('billing_client_field_rejected', false, { reason: deniedClientField })
  }

  const authority = requireBillingOwner(command.authority, command.businessId, controls)
  if (authority.kind === 'denied') {
    return error(authority.reason === 'control_disabled' ? 'billing_control_disabled' : 'billing_owner_denied', false, {
      reason: authority.reason,
    })
  }

  const operation = state.operations.find(
    (candidate) => candidate.id === command.operationId && candidate.businessId === command.businessId && candidate.ownerId === command.ownerId
  )
  if (operation === undefined) {
    return error('billing_operation_not_found', false, { reason: 'operation_not_found', operationId: command.operationId })
  }

  let portal
  try {
    portal = await provider.openCustomerPortal({
      customerId: operation.providerCustomerId,
      returnUrl: ownerAbsoluteUrl(command.appBaseUrl, `/owner/billing/${operation.id}`),
    })
  } catch {
    return error('billing_provider_unavailable', true, { reason: 'autumn_portal_failed', operationId: operation.id })
  }

  const nextOperation: BillingOperation = {
    ...operation,
    portalUrl: portal.url,
    providerRefs: [...operation.providerRefs, { provider: 'autumn_cloud' as const, objectId: portal.customerId, payloadHash: portal.payloadHash, readAt: command.now }],
    updatedAt: command.now,
  }
  const nextState = replaceOperation(state, nextOperation)
  const auditEvent = buildBillingAuditEvent({
    eventType: 'billing.portal_started',
    actorKind: 'owner',
    actorRef: command.ownerId,
    targetType: 'billing',
    targetRef: operation.id,
    businessId: command.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: operation.status,
    afterState: nextOperation.status,
    evidenceRefs: [`autumn:${portal.customerId}`, `hash:${portal.payloadHash}`],
    payloadHash: portal.payloadHash,
    createdAt: command.now,
  })

  return ok('billing_portal_started', { state: nextState, operation: nextOperation, auditEvent })
}

export function ingestBillingProviderEvent(
  state: BillingSourceState,
  command: BillingProviderEventCommand,
  controls: Pick<BillingOperatorControls, 'billingWebhooksEnabled'> = defaultBillingOperatorControls
): BillingProviderEventResult {
  const duplicate = state.providerEvents.find(
    (event) => event.provider === command.provider && event.providerEventId === command.providerEventId
  )
  if (duplicate !== undefined) {
    if (duplicate.payloadHash !== command.payloadHash) {
      return error('billing_operation_conflict', false, {
        reason: 'provider_event_payload_conflict',
        providerEventId: command.providerEventId,
      })
    }

    const auditEvent = buildBillingAuditEvent({
      eventType: 'billing.provider_event_duplicate',
      actorKind: 'system',
      actorRef: command.provider,
      targetType: 'billing_provider_event',
      targetRef: duplicate.id,
      ...(duplicate.businessId === undefined ? {} : { businessId: duplicate.businessId }),
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      beforeState: duplicate.status,
      afterState: duplicate.status,
      evidenceRefs: [`provider:${command.providerEventId}`],
      payloadHash: command.payloadHash,
      createdAt: command.receivedAt,
    })
    return ok('billing_provider_event_duplicate', { state, providerEvent: duplicate, auditEvent })
  }

  const matchedOperation = findOperationForProviderEvent(state, command)
  const rejectionReason = !controls.billingWebhooksEnabled
    ? 'webhooks_disabled'
    : command.signatureVerified
      ? undefined
      : 'signature_unverified'
  const eventStatus = rejectionReason === undefined ? (matchedOperation === undefined ? 'held_for_operator' : 'accepted') : 'rejected'
  const providerEventReason = rejectionReason ?? (matchedOperation === undefined ? 'unbound_provider_event' : undefined)
  const normalizedFieldsJson = JSON.stringify({
    eventType: command.eventType,
    providerCustomerId: command.providerCustomerId ?? null,
    providerSessionId: command.providerSessionId ?? null,
    providerSubscriptionId: command.providerSubscriptionId ?? null,
    providerStatus: command.providerStatus ?? null,
    operationId: command.operationId ?? matchedOperation?.id ?? null,
  })
  const providerEvent: BillingProviderEvent = {
    id: billingProviderEventId(command.provider, command.providerEventId),
    provider: command.provider,
    providerEventId: command.providerEventId,
    logicalProviderObjectKey:
      command.providerSubscriptionId ?? command.providerSessionId ?? command.providerCustomerId ?? command.providerEventId,
    status: eventStatus,
    eventType: command.eventType,
    payloadHash: command.payloadHash,
    redactedPayloadJson: command.redactedPayloadJson ?? normalizedFieldsJson,
    normalizedFieldsJson,
    retrievalStatus: 'not_required',
    signatureVerified: command.signatureVerified,
    correlationId: command.correlationId,
    receivedAt: command.receivedAt,
    ...(providerEventReason === undefined ? {} : { reason: providerEventReason }),
    ...(command.providerCustomerId === undefined ? {} : { providerCustomerId: command.providerCustomerId }),
    ...(command.providerSessionId === undefined ? {} : { providerSessionId: command.providerSessionId }),
    ...(command.providerSubscriptionId === undefined ? {} : { providerSubscriptionId: command.providerSubscriptionId }),
    ...(matchedOperation === undefined ? {} : { operationId: matchedOperation.id, businessId: matchedOperation.businessId }),
  }

  if (eventStatus !== 'accepted' || matchedOperation === undefined) {
    const nextState = { ...state, providerEvents: [...state.providerEvents, providerEvent] }
    const eventType: AuditEventType = eventStatus === 'rejected' ? 'billing.provider_event_rejected' : 'billing.provider_event_held'
    const auditEvent = buildBillingAuditEvent({
      eventType,
      actorKind: 'system',
      actorRef: command.provider,
      targetType: 'billing_provider_event',
      targetRef: providerEvent.id,
      ...(providerEvent.businessId === undefined ? {} : { businessId: providerEvent.businessId }),
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      beforeState: 'none',
      afterState: providerEvent.status,
      ...(providerEvent.reason === undefined ? {} : { reasonCode: providerEvent.reason }),
      evidenceRefs: [`provider:${command.providerEventId}`, `hash:${command.payloadHash}`],
      payloadHash: command.payloadHash,
      createdAt: command.receivedAt,
    })
    return ok(eventStatus === 'rejected' ? 'billing_provider_event_rejected' : 'billing_provider_event_held', {
      state: nextState,
      providerEvent,
      auditEvent,
    })
  }

  const status = billingStatusForProviderEvent(command, matchedOperation)
  const receipt = command.receipt === undefined ? undefined : createReceipt(matchedOperation, command)
  const providerSubscriptionId = command.providerSubscriptionId ?? matchedOperation.providerSubscriptionId
  const providerSessionId = command.providerSessionId ?? matchedOperation.providerSessionId
  const nextOperation: BillingOperation = {
    ...matchedOperation,
    status,
    ...(providerSubscriptionId === undefined ? {} : { providerSubscriptionId }),
    ...(providerSessionId === undefined ? {} : { providerSessionId }),
    providerRefs: [
      ...matchedOperation.providerRefs,
      { provider: command.provider, objectId: command.providerEventId, payloadHash: command.payloadHash, readAt: command.receivedAt },
    ],
    receiptIds: receipt === undefined ? matchedOperation.receiptIds : unique([...matchedOperation.receiptIds, receipt.id]),
    updatedAt: command.receivedAt,
  }
  const receiptExists = receipt !== undefined && state.receipts.some((candidate) => candidate.id === receipt.id)
  const nextState = {
    ...replaceOperation(state, nextOperation),
    providerEvents: [...state.providerEvents, providerEvent],
    receipts: receipt === undefined || receiptExists ? state.receipts : [...state.receipts, receipt],
  }
  const eventType: AuditEventType = status === 'paid_active' ? 'billing.paid_state_changed' : eventTypeForStatus(status)
  const auditEvent = buildBillingAuditEvent({
    eventType,
    actorKind: 'system',
    actorRef: command.provider,
    targetType: 'billing',
    targetRef: nextOperation.id,
    businessId: nextOperation.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: matchedOperation.status,
    afterState: nextOperation.status,
    evidenceRefs: [`provider:${command.providerEventId}`, `hash:${command.payloadHash}`],
    payloadHash: command.payloadHash,
    createdAt: command.receivedAt,
  })

  return ok('billing_provider_event_ingested', { state: nextState, providerEvent, operation: nextOperation, auditEvent })
}

export function recordBillingReturn(state: BillingSourceState, command: BillingReturnCommand): BillingReturnResult {
  const authority = requireBillingOwner(command.authority, command.businessId, defaultBillingOperatorControls)
  if (authority.kind === 'denied') {
    return error('billing_owner_denied', false, { reason: authority.reason })
  }

  const operation = state.operations.find(
    (candidate) => candidate.id === command.operationId && candidate.businessId === command.businessId && candidate.ownerId === command.ownerId
  )
  if (operation === undefined) {
    return error('billing_operation_not_found', false, { reason: 'operation_not_found', operationId: command.operationId })
  }

  const isCancel = command.returnedPath === operation.cancelPath
  const status: BillingOperationStatus = isCancel ? 'billing_cancelled' : operation.status === 'paid_active' ? 'paid_active' : 'pending_provider_redirect'
  const nextOperation = { ...operation, status, updatedAt: command.now }
  const nextState = replaceOperation(state, nextOperation)
  const auditEvent = buildBillingAuditEvent({
    eventType: isCancel ? 'billing.cancel_returned' : 'billing.return_recorded',
    actorKind: 'owner',
    actorRef: command.ownerId,
    targetType: 'billing',
    targetRef: operation.id,
    businessId: command.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: operation.status,
    afterState: nextOperation.status,
    evidenceRefs: [`path:${command.returnedPath}`],
    payloadHash: stableHash({ returnedPath: command.returnedPath, operationId: command.operationId }),
    createdAt: command.now,
  })

  return ok(isCancel ? 'billing_cancel_returned' : 'billing_return_recorded', { state: nextState, operation: nextOperation, auditEvent })
}

export async function reconcileBillingOperation(
  state: BillingSourceState,
  command: BillingReconciliationCommand,
  provider: AutumnProvider,
  controls: BillingOperatorControls = defaultBillingOperatorControls
): Promise<BillingReconciliationResult> {
  const authority = requireBillingOperator(command.authority, 'reconcile', controls)
  if (authority.kind === 'denied') {
    return error(authority.reason === 'control_disabled' ? 'billing_control_disabled' : 'billing_operator_denied', false, {
      reason: authority.reason,
    })
  }

  const operation = state.operations.find(
    (candidate) => candidate.id === command.operationId && candidate.businessId === command.businessId
  )
  if (operation === undefined) {
    return error('billing_operation_not_found', false, { reason: 'operation_not_found', operationId: command.operationId })
  }

  let readback: AutumnCustomerReadback
  try {
    readback = await provider.getCustomer(operation.providerCustomerId)
  } catch {
    const reconciliation = createReconciliation(command, 'provider_unavailable', operation, [], 'autumn_get_customer_failed')
    return ok('billing_reconciliation_missing', {
      state: { ...state, reconciliations: [...state.reconciliations, reconciliation] },
      reconciliation,
      auditEvent: reconciliationAudit(command, operation, reconciliation, 'billing.reconciliation_failed'),
    })
  }

  const providerRefs: BillingProviderRef[] = [
    { provider: 'autumn_cloud', objectId: readback.customerId, payloadHash: readback.payloadHash, readAt: command.now },
  ]
  const providerHasPlan = [...readback.subscriptions, ...readback.purchases].some(
    (snapshot) => snapshot.planId === state.offers.find((offer) => offer.id === operation.offerId)?.planId && snapshot.status === 'active'
  )
  const expectedPaid = operation.status === 'paid_active'
  const reconciliationStatus = providerHasPlan === expectedPaid ? 'matched' : providerHasPlan ? 'mismatched' : 'missing'
  const reconciliation = createReconciliation(
    command,
    reconciliationStatus,
    operation,
    providerRefs,
    reconciliationStatus === 'matched' ? undefined : 'provider_state_differs_from_source'
  )
  const nextState = { ...state, reconciliations: [...state.reconciliations, reconciliation] }
  const auditType: AuditEventType = reconciliationStatus === 'matched' ? 'billing.reconciliation_started' : 'billing.reconciliation_mismatch'

  return ok(
    reconciliationStatus === 'matched'
      ? 'billing_reconciliation_matched'
      : reconciliationStatus === 'missing'
        ? 'billing_reconciliation_missing'
        : 'billing_reconciliation_mismatched',
    { state: nextState, reconciliation, auditEvent: reconciliationAudit(command, operation, reconciliation, auditType) }
  )
}

export function markBillingNoRepair(
  state: BillingSourceState,
  command: BillingNoRepairCommand,
  controls: BillingOperatorControls = defaultBillingOperatorControls
): BillingNoRepairResult {
  const authority = requireBillingOperator(command.authority, 'mark_no_repair', controls)
  if (authority.kind === 'denied') {
    return error(authority.reason === 'control_disabled' ? 'billing_control_disabled' : 'billing_operator_denied', false, {
      reason: authority.reason,
    })
  }

  const operation = command.operationId === undefined ? undefined : state.operations.find((candidate) => candidate.id === command.operationId)
  if (command.operationId !== undefined && operation === undefined) {
    return error('billing_operation_not_found', false, { reason: 'operation_not_found', operationId: command.operationId })
  }

  const supportRecord: BillingSupportRecord = {
    id: billingSupportRecordId(command.businessId, command.operationKey),
    businessId: command.businessId,
    capability: 'paid_activation_money_rails',
    status: 'no_repair',
    reason: command.reason,
    evidenceRefs: [...command.evidenceRefs],
    operatorNextAction: 'preserve billing evidence and keep public paid claims disabled until source-owned repair',
    correlationId: command.correlationId,
    createdAt: command.now,
    updatedAt: command.now,
    ...(operation === undefined ? {} : { operationId: operation.id }),
  }
  const nextOperation = operation === undefined
    ? undefined
    : {
        ...operation,
        status: 'no_repair' as const,
        supportRecordIds: unique([...operation.supportRecordIds, supportRecord.id]),
        updatedAt: command.now,
      }
  const nextState = {
    ...(nextOperation === undefined ? state : replaceOperation(state, nextOperation)),
    supportRecords: [...state.supportRecords, supportRecord],
  }
  const auditEvent = buildBillingAuditEvent({
    eventType: 'billing.no_repair_marked',
    actorKind: 'admin',
    actorRef: command.authority?.clerkUserId ?? 'unknown_admin',
    targetType: 'billing_reconciliation',
    targetRef: command.reconciliationId ?? command.operationId ?? supportRecord.id,
    businessId: command.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: operation?.status ?? 'none',
    afterState: 'no_repair',
    reasonCode: command.reason,
    evidenceRefs: command.evidenceRefs,
    payloadHash: stableHash({ reason: command.reason, evidenceRefs: command.evidenceRefs, operationId: command.operationId ?? null }),
    createdAt: command.now,
  })

  return ok('billing_no_repair_marked', { state: nextState, supportRecord, auditEvent })
}

export function recordBillingEvidence(
  state: BillingSourceState,
  command: RecordBillingEvidenceCommand,
  controls: BillingOperatorControls = defaultBillingOperatorControls
): RecordBillingEvidenceResult {
  const authority = requireBillingOperator(command.authority, 'reconcile', controls)
  if (authority.kind === 'denied') {
    return error(authority.reason === 'control_disabled' ? 'billing_control_disabled' : 'billing_operator_denied', false, {
      reason: authority.reason,
    })
  }

  const ready = command.connectionStatus === 'ready'
  if (ready && command.evidenceSource === 'env') {
    return error('billing_event_rejected', false, { reason: 'env_vars_are_not_provider_readback' })
  }
  if (ready && (command.providerObjectId === undefined || command.payloadHash === undefined || command.routeEvidenceRef === undefined)) {
    return error('billing_event_rejected', false, { reason: 'provider_readback_evidence_required' })
  }

  const payloadHash = command.payloadHash ?? stableHash({
    provider: command.provider,
    connectionStatus: command.connectionStatus,
    evidenceSource: command.evidenceSource,
    operatorNextAction: command.operatorNextAction,
  })
  const evidenceRefs = [
    `provider:${command.provider}`,
    ...(command.providerObjectId === undefined ? [] : [`object:${command.providerObjectId}`]),
    ...(command.routeEvidenceRef === undefined ? [] : [`route:${command.routeEvidenceRef}`]),
    `hash:${payloadHash}`,
  ]
  const supportRecord: BillingSupportRecord = {
    id: billingSupportRecordId(command.businessId, command.operationKey),
    businessId: command.businessId,
    capability: 'paid_activation_money_rails',
    status: ready ? 'resolved' : 'open',
    reason: `provider_${command.connectionStatus}:${command.operatorNextAction}`,
    evidenceRefs,
    operatorNextAction: command.operatorNextAction,
    correlationId: command.correlationId,
    createdAt: command.now,
    updatedAt: command.now,
  }
  const nextState = { ...state, supportRecords: [...state.supportRecords, supportRecord] }
  const auditEvent = buildBillingAuditEvent({
    eventType: ready ? 'billing.reconciliation_repaired' : 'billing.reconciliation_failed',
    actorKind: 'admin',
    actorRef: command.authority?.clerkUserId ?? 'unknown_admin',
    targetType: 'billing',
    targetRef: supportRecord.id,
    businessId: command.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: 'unknown',
    afterState: command.connectionStatus,
    evidenceRefs,
    payloadHash,
    createdAt: command.now,
  })

  return ok('billing_evidence_recorded', { state: nextState, supportRecord, auditEvent })
}

export function readBillingStatus(state: BillingSourceState, command: ReadBillingStatusCommand): ReadBillingStatusResult {
  if (
    command.authority === undefined ||
    command.authority.businessId !== command.businessId ||
    command.authority.ownerId !== command.ownerId
  ) {
    return error('billing_owner_denied', false, { reason: 'wrong_owner' })
  }

  const ownedOperations = state.operations.filter(
    (operation) => operation.businessId === command.businessId && operation.ownerId === command.ownerId
  )
  const operation =
    command.operationId === undefined
      ? [...ownedOperations].sort((left, right) => right.updatedAt - left.updatedAt)[0]
      : ownedOperations.find((candidate) => candidate.id === command.operationId)

  return operation === undefined
    ? ok('billing_status_read', { status: 'not_started' as const })
    : ok('billing_status_read', { status: operation.status, operation })
}

export function readReceipt(state: BillingSourceState, command: ReadReceiptCommand): ReadReceiptResult {
  if (
    command.authority === undefined ||
    command.authority.businessId !== command.businessId ||
    command.authority.ownerId !== command.ownerId
  ) {
    return error('billing_owner_denied', false, { reason: 'wrong_owner' })
  }

  const receipt = state.receipts.find((candidate) => candidate.id === command.receiptId)
  const operation =
    receipt === undefined ? undefined : state.operations.find((candidate) => candidate.id === receipt.operationId)
  if (
    receipt === undefined ||
    operation === undefined ||
    receipt.businessId !== command.businessId ||
    operation.ownerId !== command.ownerId
  ) {
    return error('billing_operation_not_found', false, { reason: 'receipt_not_found' })
  }

  return ok('billing_receipt_read', { receipt })
}

export function readBillingReconciliation(
  state: BillingSourceState,
  command: ReadBillingReconciliationCommand,
  controls: BillingOperatorControls = defaultBillingOperatorControls
): ReadBillingReconciliationResult {
  const authority = requireBillingOperator(command.authority, 'read', controls)
  if (authority.kind === 'denied') {
    return error('billing_operator_denied', false, { reason: authority.reason })
  }

  const reconciliation = state.reconciliations.find(
    (candidate) => candidate.id === command.reconciliationId && candidate.businessId === command.businessId
  )
  if (reconciliation === undefined) {
    return error('billing_reconciliation_unavailable', false, { reason: 'reconciliation_not_found' })
  }

  return ok('billing_reconciliation_read', { reconciliation })
}

export async function retryBillingReconciliation(
  state: BillingSourceState,
  command: BillingReconciliationCommand,
  provider: AutumnProvider,
  controls: BillingOperatorControls = defaultBillingOperatorControls
): Promise<BillingReconciliationResult> {
  return reconcileBillingOperation(state, command, provider, controls)
}

export function disablePaidActivation(
  state: BillingSourceState,
  command: DisablePaidActivationCommand,
  controls: BillingOperatorControls = defaultBillingOperatorControls
): DisablePaidActivationResult {
  const authority = requireBillingOperator(command.authority, 'disable', controls)
  if (authority.kind === 'denied') {
    return error(authority.reason === 'control_disabled' ? 'billing_control_disabled' : 'billing_operator_denied', false, {
      reason: authority.reason,
    })
  }

  const supportRecord: BillingSupportRecord = {
    id: billingSupportRecordId(command.businessId, command.operationKey),
    businessId: command.businessId,
    capability: 'paid_activation_money_rails',
    status: 'open',
    reason: command.reason,
    evidenceRefs: [...command.evidenceRefs],
    operatorNextAction: 'keep paid activation disabled until support closes the recorded issue',
    correlationId: command.correlationId,
    createdAt: command.now,
    updatedAt: command.now,
  }
  const operations = state.operations.map((operation) =>
    operation.businessId === command.businessId
      ? {
          ...operation,
          status: 'paid_activation_disabled' as const,
          supportRecordIds: unique([...operation.supportRecordIds, supportRecord.id]),
          updatedAt: command.now,
        }
      : operation
  )
  const nextState = { ...state, operations, supportRecords: [...state.supportRecords, supportRecord] }
  const auditEvent = buildBillingAuditEvent({
    eventType: 'billing.cancelled',
    actorKind: 'admin',
    actorRef: command.authority?.clerkUserId ?? 'unknown_admin',
    targetType: 'billing',
    targetRef: command.businessId,
    businessId: command.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: 'enabled',
    afterState: 'paid_activation_disabled',
    reasonCode: command.reason,
    evidenceRefs: command.evidenceRefs,
    payloadHash: stableHash({ reason: command.reason, evidenceRefs: command.evidenceRefs }),
    createdAt: command.now,
  })

  return ok('billing_paid_activation_disabled', { state: nextState, supportRecord, auditEvent })
}

function providerCustomerIdFor(businessId: BusinessId, ownerId: OwnerId): string {
  return `ae_${businessId}_${ownerId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function ownerAbsoluteUrl(appBaseUrl: string, path: string): string {
  return `${appBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

function billingOperationId(businessId: BusinessId, offerId: BillingOffer['id'], operationKey: OperationKey): BillingOperationId {
  return brandNonEmpty(`billing_operation:${businessId}:${offerId}:${operationKey}`, 'BillingOperationId')
}

function billingReceiptId(operationId: BillingOperationId, providerReceiptId: string): BillingReceiptId {
  return brandNonEmpty(`billing_receipt:${operationId}:${providerReceiptId}`, 'BillingReceiptId')
}

function billingProviderEventId(provider: string, providerEventId: string): BillingProviderEventId {
  return brandNonEmpty(`billing_provider_event:${provider}:${providerEventId}`, 'BillingProviderEventId')
}

function billingReconciliationId(operationId: BillingOperationId, operationKey: OperationKey): BillingReconciliationId {
  return brandNonEmpty(`billing_reconciliation:${operationId}:${operationKey}`, 'BillingReconciliationId')
}

function billingSupportRecordId(businessId: BusinessId, operationKey: OperationKey): BillingSupportRecordId {
  return brandNonEmpty(`billing_support:${businessId}:${operationKey}`, 'BillingSupportRecordId')
}

function findClientSuppliedField(fields: Record<string, unknown> | undefined): string | undefined {
  if (fields === undefined) {
    return undefined
  }

  return BillingClientSuppliedFieldValues.find((field) => Object.hasOwn(fields, field))
}

function replaceOperation(state: BillingSourceState, operation: BillingOperation): BillingSourceState {
  return {
    ...state,
    operations: state.operations.map((candidate) => (candidate.id === operation.id ? operation : candidate)),
  }
}

function findOperationForProviderEvent(
  state: BillingSourceState,
  command: BillingProviderEventCommand
): BillingOperation | undefined {
  if (command.operationId !== undefined) {
    return state.operations.find((operation) => operation.id === command.operationId)
  }

  return state.operations.find((operation) => {
    if (command.providerSessionId !== undefined && operation.providerSessionId === command.providerSessionId) {
      return true
    }
    if (command.providerSubscriptionId !== undefined && operation.providerSubscriptionId === command.providerSubscriptionId) {
      return true
    }
    return command.providerCustomerId !== undefined && operation.providerCustomerId === command.providerCustomerId
  })
}

function billingStatusForProviderEvent(command: BillingProviderEventCommand, operation: BillingOperation): BillingOperationStatus {
  if (command.providerStatus === 'active') {
    return command.planId === undefined || operation.offerId.includes(command.planId) ? 'paid_active' : operation.status
  }
  if (command.providerStatus === 'past_due') {
    return 'past_due'
  }
  if (command.providerStatus === 'payment_failed') {
    return 'payment_failed'
  }
  if (command.providerStatus === 'requires_action') {
    return 'required_action'
  }
  if (command.providerStatus === 'refunded') {
    return 'refunded'
  }
  if (command.providerStatus === 'disputed') {
    return 'dispute_hold'
  }
  if (command.providerStatus === 'chargeback') {
    return 'chargeback_recorded'
  }
  if (command.providerStatus === 'cancelled' || command.providerStatus === 'expired') {
    return 'billing_cancelled'
  }

  return operation.status
}

function createReceipt(operation: BillingOperation, command: BillingProviderEventCommand): BillingReceipt | undefined {
  if (command.receipt === undefined) {
    return undefined
  }

  return {
    id: billingReceiptId(operation.id, command.receipt.providerReceiptId),
    operationId: operation.id,
    businessId: operation.businessId,
    provider: command.provider,
    providerReceiptId: command.receipt.providerReceiptId,
    status: command.receipt.status,
    payloadHash: command.payloadHash,
    providerEvidenceRefs: [`provider:${command.providerEventId}`, `hash:${command.payloadHash}`],
    paidStateTransition: `${operation.status}->${billingStatusForProviderEvent(command, operation)}`,
    refundReversalDisputeRefs: reversalRefsForReceipt(command),
    correlationId: command.correlationId,
    issuedAt: command.receipt.issuedAt,
    recordedAt: command.receivedAt,
    ...(command.receipt.invoiceUrl === undefined ? {} : { invoiceUrl: command.receipt.invoiceUrl }),
    ...(command.receipt.amountSummary === undefined ? {} : { amountSummary: command.receipt.amountSummary }),
  }
}

function eventTypeForStatus(status: BillingOperationStatus): AuditEventType {
  switch (status) {
    case 'payment_failed':
      return 'billing.reconciliation_failed'
    case 'past_due':
      return 'billing.past_due_recorded'
    case 'refunded':
      return 'billing.refund_recorded'
    case 'dispute_hold':
      return 'billing.dispute_recorded'
    case 'chargeback_recorded':
      return 'billing.chargeback_recorded'
    case 'billing_cancelled':
      return 'billing.cancelled'
    default:
      return 'billing.provider_event_ingested'
  }
}

function createReconciliation(
  command: BillingReconciliationCommand,
  status: BillingReconciliation['status'],
  operation: BillingOperation,
  providerRefs: BillingProviderRef[],
  reason?: string
): BillingReconciliation {
  return {
    id: billingReconciliationId(operation.id, command.operationKey),
    operationId: operation.id,
    businessId: command.businessId,
    status,
    provider: 'autumn_cloud',
    retryCount: operation.retryCount,
    providerRefs,
    evidenceRefs: providerRefs.map((ref) => `${ref.provider}:${ref.objectId}`),
    operatorNextAction: operatorNextActionForReconciliation(status),
    createdAt: command.now,
    updatedAt: command.now,
    ...(command.authority?.clerkUserId === undefined ? {} : { actorRef: command.authority.clerkUserId }),
    ...(reason === undefined ? {} : { reason }),
  }
}

function reversalRefsForReceipt(command: BillingProviderEventCommand): string[] {
  if (command.receipt?.status === 'refunded' || command.receipt?.status === 'disputed' || command.receipt?.status === 'chargeback') {
    return [`provider:${command.providerEventId}`, `hash:${command.payloadHash}`]
  }

  return []
}

function operatorNextActionForReconciliation(status: BillingReconciliation['status']): string {
  switch (status) {
    case 'matched':
      return 'keep receipt and entitlement readbacks reconstructable'
    case 'retry_available':
      return 'retry reconciliation after provider retry window'
    case 'retry_exhausted':
      return 'mark no-repair or disable public paid claims'
    case 'no_repair':
      return 'preserve evidence and keep public paid claims disabled'
    default:
      return 'review provider readback before making or restoring public paid claims'
  }
}

function reconciliationAudit(
  command: BillingReconciliationCommand,
  operation: BillingOperation,
  reconciliation: BillingReconciliation,
  eventType: AuditEventType
): AuditEventContract {
  return buildBillingAuditEvent({
    eventType,
    actorKind: 'admin',
    actorRef: command.authority?.clerkUserId ?? 'unknown_admin',
    targetType: 'billing_reconciliation',
    targetRef: reconciliation.id,
    businessId: command.businessId,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    beforeState: operation.status,
    afterState: reconciliation.status,
    ...(reconciliation.reason === undefined ? {} : { reasonCode: reconciliation.reason }),
    evidenceRefs: reconciliation.evidenceRefs,
    payloadHash: stableHash({ reconciliationId: reconciliation.id, status: reconciliation.status, reason: reconciliation.reason ?? null }),
    createdAt: command.now,
  })
}

function buildBillingAuditEvent(input: {
  eventType: AuditEventType
  actorKind: ActorKind
  actorRef: string
  targetType: AuditTargetType
  targetRef: string
  businessId?: BusinessId | undefined
  operationKey: OperationKey
  correlationId: CorrelationId
  beforeState: string
  afterState: string
  reasonCode?: string | undefined
  evidenceRefs: readonly string[]
  payloadHash: SourceHash
  createdAt: number
}): AuditEventContract {
  const event: AuditEventContract = {
    eventId: brandNonEmpty(`audit:${input.eventType}:${input.targetRef}:${input.operationKey}`, 'AuditEventId'),
    eventType: input.eventType,
    actorKind: input.actorKind,
    actorRef: input.actorRef,
    targetType: input.targetType,
    targetRef: input.targetRef,
    idempotencyKey: input.operationKey,
    correlationId: input.correlationId,
    beforeState: input.beforeState,
    afterState: input.afterState,
    evidenceRefs: input.evidenceRefs,
    redactedPayload: {
      eventType: input.eventType,
      targetType: input.targetType,
      targetRef: input.targetRef,
      reasonCode: input.reasonCode ?? null,
    },
    payloadHash: input.payloadHash,
    createdAt: input.createdAt,
    ...(input.businessId === undefined ? {} : { businessId: input.businessId }),
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
  }
  const validation = validateAuditEvent(event)
  if (!validation.valid) {
    throw new Error(`Invalid billing audit event: ${validation.reason}`)
  }

  return event
}

function unique<Value>(values: readonly Value[]): Value[] {
  return [...new Set(values)]
}
