import { SOURCE_WRITE_MAX_AGE_MS, sourceWriteKeyFamilyForScope, type SourceWriteAdmission } from '../../../../src/modules/security/source-write-admission'

export type SourceWriteMutationCtx = { db: unknown }
type SourceWriteNonceDb = {
  query: (tableName: string) => SourceWriteNonceQuery
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
}
type SourceWriteNonceQuery = {
  withIndex: (indexName: string, callback: (query: SourceWriteNonceIndexBuilder) => SourceWriteNonceIndexBuilder) => SourceWriteNonceQuery
  unique: () => Promise<Record<string, unknown> | null>
}
type SourceWriteNonceIndexBuilder = { eq: (field: string, value: unknown) => SourceWriteNonceIndexBuilder }

export async function consumeSourceWriteNonce(
  ctx: SourceWriteMutationCtx,
  admission: SourceWriteAdmission,
): Promise<{ kind: 'accepted' } | { kind: 'rejected'; reason: 'source_write_nonce_replayed' }> {
  const db = ctx.db as SourceWriteNonceDb
  const existing = await db
    .query('sourceWriteNonces')
    .withIndex('by_keyId_and_nonce', (query) => query.eq('keyId', admission.keyId).eq('nonce', admission.nonce))
    .unique()
  if (existing !== null) return { kind: 'rejected', reason: 'source_write_nonce_replayed' }

  await db.insert('sourceWriteNonces', {
    keyId: admission.keyId,
    nonce: admission.nonce,
    family: sourceWriteKeyFamilyForScope(admission.scope),
    scope: admission.scope,
    operationKey: admission.operationKey,
    correlationId: admission.correlationId,
    commandDigest: admission.commandDigest,
    bodyDigest: admission.bodyDigest,
    issuedAt: admission.issuedAt,
    consumedAt: Date.now(),
    expiresAt: admission.issuedAt + SOURCE_WRITE_MAX_AGE_MS,
  })
  return { kind: 'accepted' }
}
