import {
  clearanceActionClassSchema,
  clearanceGatewayCheckStatusSchema,
  clearanceIsolationStateStatusSchema,
  type ClearanceActionClass,
  type ClearanceGatewayCheckStatus,
  type ClearanceIsolationStateStatus,
  type ClearanceSignaturePosture,
  type ClearanceSignedRecordKind,
} from './clearance-schema'

export const ClearanceProtocolStoreVersion = 'clearance-protocol-store:v1' as const

export const ClearanceProtocolRecordStatusValues = [
  'accepted',
  'consumed',
  'proof_gap',
  'rejected',
  'expired',
] as const
export type ClearanceProtocolRecordStatus = (typeof ClearanceProtocolRecordStatusValues)[number]

export const ClearanceProtocolStoreRejectionReasonValues = [
  'clearance_record_conflict',
  'clearance_greenlight_required',
  'clearance_greenlight_kind_mismatch',
  'clearance_greenlight_principal_mismatch',
  'clearance_greenlight_action_mismatch',
  'clearance_greenlight_expired',
  'clearance_greenlight_replay_rejected',
  'clearance_greenlight_not_accepted',
  'clearance_greenlight_reference_ambiguous',
] as const
export type ClearanceProtocolStoreRejectionReason = (typeof ClearanceProtocolStoreRejectionReasonValues)[number]

export type ClearanceProtocolRecord = Readonly<{
  recordId: string
  recordKind: ClearanceSignedRecordKind
  principalId: string
  actionClass: ClearanceActionClass
  actionRef: string
  mandateId?: string | undefined
  requestRef?: string | undefined
  greenlightRef?: string | undefined
  idempotencyKey: string
  payloadHash: string
  signaturePosture: ClearanceSignaturePosture
  keyIdentityRef: string
  status: ClearanceProtocolRecordStatus
  createdAt: number
  expiresAt?: number | undefined
  signature?: string | undefined
  signedAt?: string | undefined
  proofGapReason?: string | undefined
  consumedAt?: number | undefined
  consumedByRef?: string | undefined
}>

export type PutClearanceRecordResult =
  | Readonly<{ kind: 'inserted'; record: ClearanceProtocolRecord }>
  | Readonly<{ kind: 'replayed'; record: ClearanceProtocolRecord }>
  | Readonly<{
      kind: 'rejected'
      reason: Extract<ClearanceProtocolStoreRejectionReason, 'clearance_record_conflict'>
      record?: ClearanceProtocolRecord | undefined
    }>

export type ConsumeClearanceGreenlightCommand = Readonly<{
  recordId?: string | undefined
  greenlightRef?: string | undefined
  principalId: string
  actionClass: ClearanceActionClass
  actionRef: string
  now: number
  consumedByRef: string
}>

export type ConsumeClearanceGreenlightResult =
  | Readonly<{ kind: 'consumed'; record: ClearanceProtocolRecord }>
  | Readonly<{
      kind: 'rejected'
      reason: Exclude<ClearanceProtocolStoreRejectionReason, 'clearance_record_conflict'>
      record?: ClearanceProtocolRecord | undefined
    }>

export type ClearanceGatewayCheckRecord = Readonly<{
  checkId: string
  principalId: string
  actionClass: ClearanceActionClass
  actionRef: string
  status: ClearanceGatewayCheckStatus
  sourceHash: string
  checkedAt: number
}>

export type CommitClearanceGatewayCheckResult =
  | Readonly<{ kind: 'committed'; record: ClearanceGatewayCheckRecord }>
  | Readonly<{ kind: 'replayed'; record: ClearanceGatewayCheckRecord }>
  | Readonly<{
      kind: 'rejected'
      reason: Extract<ClearanceProtocolStoreRejectionReason, 'clearance_record_conflict'>
      record?: ClearanceGatewayCheckRecord | undefined
    }>

export type ClearanceIsolationStateRecord = Readonly<{
  isolationId: string
  principalId: string
  status: ClearanceIsolationStateStatus
  reasonCode?: string | undefined
  updatedAt: number
}>

export type CommitClearanceIsolationStateResult =
  | Readonly<{ kind: 'committed'; record: ClearanceIsolationStateRecord }>
  | Readonly<{ kind: 'replayed'; record: ClearanceIsolationStateRecord }>
  | Readonly<{
      kind: 'rejected'
      reason: Extract<ClearanceProtocolStoreRejectionReason, 'clearance_record_conflict'>
      record?: ClearanceIsolationStateRecord | undefined
    }>

export type ClearanceProtocolRuntimeDocument = Record<string, unknown> & { _id: string }

export type ClearanceProtocolIndexBuilder = {
  eq: (field: string, value: unknown) => ClearanceProtocolIndexBuilder
}

export type ClearanceProtocolQuery = {
  withIndex: (
    indexName: string,
    callback: (query: ClearanceProtocolIndexBuilder) => ClearanceProtocolIndexBuilder,
  ) => ClearanceProtocolQuery
  unique: () => Promise<ClearanceProtocolRuntimeDocument | null>
}

export type ClearanceProtocolRuntimeDb = {
  query: (tableName: string) => ClearanceProtocolQuery
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

export async function putClearanceRecordIfAbsentOrSame(
  db: ClearanceProtocolRuntimeDb,
  command: ClearanceProtocolRecord,
): Promise<PutClearanceRecordResult> {
  const existing = await findClearanceRecord(db, command.recordId)
  if (existing !== undefined) {
    if (sameClearanceRecord(existing, command) || sameClearanceConsumedReplay(existing, command)) {
      return { kind: 'replayed', record: existing }
    }

    return { kind: 'rejected', reason: 'clearance_record_conflict', record: existing }
  }

  const idempotencyConflict = await findConflictingIdempotencyEntry(db, command)
  if (idempotencyConflict !== undefined) {
    return idempotencyConflict.record === undefined
      ? { kind: 'rejected', reason: 'clearance_record_conflict' }
      : { kind: 'rejected', reason: 'clearance_record_conflict', record: idempotencyConflict.record }
  }

  await db.insert('handshakeRecords', recordToDocument(command))
  await putIdempotencyLedgerEntry(db, command)
  return { kind: 'inserted', record: command }
}

export async function recordClearanceProofGap(
  db: ClearanceProtocolRuntimeDb,
  command: ClearanceProtocolRecord,
): Promise<PutClearanceRecordResult> {
  return putClearanceRecordIfAbsentOrSame(db, { ...command, status: 'proof_gap' })
}

export async function consumeClearanceGreenlight(
  db: ClearanceProtocolRuntimeDb,
  command: ConsumeClearanceGreenlightCommand,
): Promise<ConsumeClearanceGreenlightResult> {
  const recordId = resolveGreenlightRecordId(command)
  if (recordId === undefined) {
    return { kind: 'rejected', reason: 'clearance_greenlight_reference_ambiguous' }
  }

  const existing = await findClearanceRecord(db, recordId)
  if (existing === undefined) {
    return { kind: 'rejected', reason: 'clearance_greenlight_required' }
  }

  if (existing.recordKind !== 'greenlight') {
    return { kind: 'rejected', reason: 'clearance_greenlight_kind_mismatch', record: existing }
  }

  if (existing.principalId !== command.principalId) {
    return { kind: 'rejected', reason: 'clearance_greenlight_principal_mismatch', record: existing }
  }

  if (existing.actionClass !== command.actionClass || existing.actionRef !== command.actionRef) {
    return { kind: 'rejected', reason: 'clearance_greenlight_action_mismatch', record: existing }
  }

  if (existing.status === 'consumed') {
    return existing.consumedByRef === command.consumedByRef
      ? { kind: 'consumed', record: existing }
      : { kind: 'rejected', reason: 'clearance_greenlight_replay_rejected', record: existing }
  }

  if (existing.status !== 'accepted') {
    return { kind: 'rejected', reason: 'clearance_greenlight_not_accepted', record: existing }
  }

  if (existing.expiresAt !== undefined && existing.expiresAt <= command.now) {
    const expired = { ...existing, status: 'expired' as const }
    await db.patch(existing._id, { status: expired.status })
    return { kind: 'rejected', reason: 'clearance_greenlight_expired', record: expired }
  }

  const consumed: ClearanceProtocolRecord = {
    ...existing,
    status: 'consumed',
    consumedAt: command.now,
    consumedByRef: command.consumedByRef,
  }
  await db.patch(existing._id, {
    status: consumed.status,
    consumedAt: consumed.consumedAt,
    consumedByRef: consumed.consumedByRef,
  })
  await putIdempotencyLedgerEntry(db, {
    ...consumed,
    idempotencyKey: command.consumedByRef,
  })

  return { kind: 'consumed', record: consumed }
}

export async function readClearanceRecord(
  db: ClearanceProtocolRuntimeDb,
  recordId: string,
): Promise<ClearanceProtocolRecord | undefined> {
  const found = await findClearanceRecord(db, recordId)
  if (found === undefined) {
    return undefined
  }
  const { _id: _storageId, ...record } = found
  return record
}

export async function commitClearanceGatewayCheck(
  db: ClearanceProtocolRuntimeDb,
  command: ClearanceGatewayCheckRecord,
): Promise<CommitClearanceGatewayCheckResult> {
  const existing = await db
    .query('handshakeGatewayChecks')
    .withIndex('by_checkId', (query) => query.eq('checkId', command.checkId))
    .unique()
  if (existing === null) {
    await db.insert('handshakeGatewayChecks', gatewayCheckToDocument(command))
    return { kind: 'committed', record: command }
  }

  const record = documentToGatewayCheck(existing)
  if (sameClearanceGatewayCheck(record, command)) {
    return { kind: 'replayed', record }
  }

  return { kind: 'rejected', reason: 'clearance_record_conflict', record }
}

export async function commitClearanceIsolationState(
  db: ClearanceProtocolRuntimeDb,
  command: ClearanceIsolationStateRecord,
): Promise<CommitClearanceIsolationStateResult> {
  const existing = await db
    .query('handshakeIsolationStates')
    .withIndex('by_isolationId', (query) => query.eq('isolationId', command.isolationId))
    .unique()
  if (existing === null) {
    await db.insert('handshakeIsolationStates', isolationStateToDocument(command))
    return { kind: 'committed', record: command }
  }

  const record = documentToIsolationState(existing)
  if (sameClearanceIsolationState(record, command)) {
    return { kind: 'replayed', record }
  }

  return { kind: 'rejected', reason: 'clearance_record_conflict', record }
}

async function findClearanceRecord(
  db: ClearanceProtocolRuntimeDb,
  recordId: string,
): Promise<(ClearanceProtocolRecord & { _id: string }) | undefined> {
  const row = await db
    .query('handshakeRecords')
    .withIndex('by_recordId', (query) => query.eq('recordId', recordId))
    .unique()
  return row === null ? undefined : documentToRecord(row)
}

async function findConflictingIdempotencyEntry(
  db: ClearanceProtocolRuntimeDb,
  record: ClearanceProtocolRecord,
): Promise<Readonly<{ record?: ClearanceProtocolRecord & { _id: string } }> | undefined> {
  const ledgerKey = buildLedgerKey(record)
  const existing = await db
    .query('handshakeIdempotencyLedger')
    .withIndex('by_ledgerKey', (query) => query.eq('ledgerKey', ledgerKey))
    .unique()
  if (existing === null || (existing.payloadHash === record.payloadHash && existing.recordId === record.recordId)) {
    return undefined
  }

  const existingRecord = await findClearanceRecord(db, String(existing.recordId))
  return existingRecord === undefined ? {} : { record: existingRecord }
}

async function putIdempotencyLedgerEntry(
  db: ClearanceProtocolRuntimeDb,
  record: ClearanceProtocolRecord,
): Promise<void> {
  const ledgerKey = buildLedgerKey(record)
  const existing = await db
    .query('handshakeIdempotencyLedger')
    .withIndex('by_ledgerKey', (query) => query.eq('ledgerKey', ledgerKey))
    .unique()
  const row = {
    ledgerKey,
    recordId: record.recordId,
    principalId: record.principalId,
    actionClass: record.actionClass,
    actionRef: record.actionRef,
    idempotencyKey: record.idempotencyKey,
    payloadHash: record.payloadHash,
    status: record.status,
    createdAt: record.createdAt,
  }
  if (existing === null) {
    await db.insert('handshakeIdempotencyLedger', row)
    return
  }

  if (existing.payloadHash === record.payloadHash && existing.recordId === record.recordId) {
    return
  }

  throw new Error('clearance_idempotency_conflict')
}

function buildLedgerKey(record: Pick<ClearanceProtocolRecord, 'principalId' | 'actionClass' | 'actionRef' | 'idempotencyKey'>): string {
  return `${record.principalId}:${record.actionClass}:${record.actionRef}:${record.idempotencyKey}`
}

function resolveGreenlightRecordId(command: ConsumeClearanceGreenlightCommand): string | undefined {
  if (command.recordId !== undefined && command.greenlightRef !== undefined && command.recordId !== command.greenlightRef) {
    return undefined
  }
  return command.recordId ?? command.greenlightRef
}

function sameClearanceRecord(left: ClearanceProtocolRecord, right: ClearanceProtocolRecord): boolean {
  return (
    left.recordId === right.recordId &&
    left.recordKind === right.recordKind &&
    left.principalId === right.principalId &&
    left.actionClass === right.actionClass &&
    left.actionRef === right.actionRef &&
    left.mandateId === right.mandateId &&
    left.requestRef === right.requestRef &&
    left.greenlightRef === right.greenlightRef &&
    left.idempotencyKey === right.idempotencyKey &&
    left.payloadHash === right.payloadHash &&
    left.signaturePosture === right.signaturePosture &&
    left.keyIdentityRef === right.keyIdentityRef &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.expiresAt === right.expiresAt &&
    left.signature === right.signature &&
    left.signedAt === right.signedAt &&
    left.proofGapReason === right.proofGapReason &&
    left.consumedAt === right.consumedAt &&
    left.consumedByRef === right.consumedByRef
  )
}

function sameClearanceConsumedReplay(left: ClearanceProtocolRecord, right: ClearanceProtocolRecord): boolean {
  return (
    left.status === 'consumed' &&
    right.status === 'accepted' &&
    sameClearanceRecord(
      { ...left, status: 'accepted', consumedAt: undefined, consumedByRef: undefined },
      right,
    )
  )
}

function recordToDocument(record: ClearanceProtocolRecord): Record<string, unknown> {
  return {
    storeVersion: ClearanceProtocolStoreVersion,
    recordId: record.recordId,
    recordKind: record.recordKind,
    principalId: record.principalId,
    actionClass: record.actionClass,
    actionRef: record.actionRef,
    ...(record.mandateId === undefined ? {} : { mandateId: record.mandateId }),
    ...(record.requestRef === undefined ? {} : { requestRef: record.requestRef }),
    ...(record.greenlightRef === undefined ? {} : { greenlightRef: record.greenlightRef }),
    idempotencyKey: record.idempotencyKey,
    payloadHash: record.payloadHash,
    signaturePosture: record.signaturePosture,
    keyIdentityRef: record.keyIdentityRef,
    status: record.status,
    createdAt: record.createdAt,
    ...(record.expiresAt === undefined ? {} : { expiresAt: record.expiresAt }),
    ...(record.signature === undefined ? {} : { signature: record.signature }),
    ...(record.signedAt === undefined ? {} : { signedAt: record.signedAt }),
    ...(record.proofGapReason === undefined ? {} : { proofGapReason: record.proofGapReason }),
    ...(record.consumedAt === undefined ? {} : { consumedAt: record.consumedAt }),
    ...(record.consumedByRef === undefined ? {} : { consumedByRef: record.consumedByRef }),
  }
}
function documentToRecord(row: ClearanceProtocolRuntimeDocument): ClearanceProtocolRecord & { _id: string } {
  return {
    _id: row._id,
    recordId: String(row.recordId),
    recordKind: row.recordKind as ClearanceSignedRecordKind,
    principalId: String(row.principalId),
    actionClass: row.actionClass as ClearanceActionClass,
    actionRef: String(row.actionRef),
    ...(row.mandateId === undefined ? {} : { mandateId: String(row.mandateId) }),
    ...(row.requestRef === undefined ? {} : { requestRef: String(row.requestRef) }),
    ...(row.greenlightRef === undefined ? {} : { greenlightRef: String(row.greenlightRef) }),
    idempotencyKey: String(row.idempotencyKey),
    payloadHash: String(row.payloadHash),
    signaturePosture: row.signaturePosture as ClearanceSignaturePosture,
    keyIdentityRef: String(row.keyIdentityRef),
    status: row.status as ClearanceProtocolRecordStatus,
    createdAt: Number(row.createdAt),
    ...(row.expiresAt === undefined ? {} : { expiresAt: Number(row.expiresAt) }),
    ...(row.signature === undefined ? {} : { signature: String(row.signature) }),
    ...(row.signedAt === undefined ? {} : { signedAt: String(row.signedAt) }),
    ...(row.proofGapReason === undefined ? {} : { proofGapReason: String(row.proofGapReason) }),
    ...(row.consumedAt === undefined ? {} : { consumedAt: Number(row.consumedAt) }),
    ...(row.consumedByRef === undefined ? {} : { consumedByRef: String(row.consumedByRef) }),
  }
}

function gatewayCheckToDocument(record: ClearanceGatewayCheckRecord): Record<string, unknown> {
  return {
    checkId: record.checkId,
    principalId: record.principalId,
    actionClass: record.actionClass,
    actionRef: record.actionRef,
    status: record.status,
    sourceHash: record.sourceHash,
    checkedAt: record.checkedAt,
  }
}

function documentToGatewayCheck(row: ClearanceProtocolRuntimeDocument): ClearanceGatewayCheckRecord {
  return {
    checkId: String(row.checkId),
    principalId: String(row.principalId),
    actionClass: clearanceActionClassSchema.parse(row.actionClass),
    actionRef: String(row.actionRef),
    status: clearanceGatewayCheckStatusSchema.parse(row.status),
    sourceHash: String(row.sourceHash),
    checkedAt: Number(row.checkedAt),
  }
}

function sameClearanceGatewayCheck(left: ClearanceGatewayCheckRecord, right: ClearanceGatewayCheckRecord): boolean {
  return (
    left.checkId === right.checkId &&
    left.principalId === right.principalId &&
    left.actionClass === right.actionClass &&
    left.actionRef === right.actionRef &&
    left.status === right.status &&
    left.sourceHash === right.sourceHash &&
    left.checkedAt === right.checkedAt
  )
}

function isolationStateToDocument(record: ClearanceIsolationStateRecord): Record<string, unknown> {
  return {
    isolationId: record.isolationId,
    principalId: record.principalId,
    status: record.status,
    ...(record.reasonCode === undefined ? {} : { reasonCode: record.reasonCode }),
    updatedAt: record.updatedAt,
  }
}

function documentToIsolationState(row: ClearanceProtocolRuntimeDocument): ClearanceIsolationStateRecord {
  return {
    isolationId: String(row.isolationId),
    principalId: String(row.principalId),
    status: clearanceIsolationStateStatusSchema.parse(row.status),
    ...(row.reasonCode === undefined ? {} : { reasonCode: String(row.reasonCode) }),
    updatedAt: Number(row.updatedAt),
  }
}

function sameClearanceIsolationState(left: ClearanceIsolationStateRecord, right: ClearanceIsolationStateRecord): boolean {
  return (
    left.isolationId === right.isolationId &&
    left.principalId === right.principalId &&
    left.status === right.status &&
    left.reasonCode === right.reasonCode &&
    left.updatedAt === right.updatedAt
  )
}
