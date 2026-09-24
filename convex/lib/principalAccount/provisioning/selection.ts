import { WorkspaceProvisioningError, type ProvisionDb } from './contracts'

export async function upsertSessionSelection(
  db: ProvisionDb['db'],
  canonicalPrincipalRef: string,
  activeAccountRef: string,
  correlationRefValue: string,
  now: number,
): Promise<void> {
  const existingRows = await db
    .query('interactiveSessionSelections')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', canonicalPrincipalRef))
    .take(2)
  if (existingRows.length > 1) {
    throw new WorkspaceProvisioningError('authority_conflict')
  }
  const [existing] = existingRows
  if (existing !== undefined) {
    await db.patch(existing._id, {
      activeAccountRef,
      revision: existing.revision + 1,
      selectedAt: now,
      lastCorrelationRef: correlationRefValue,
    })
    return
  }
  await db.insert('interactiveSessionSelections', {
    principalRef: canonicalPrincipalRef,
    activeAccountRef,
    revision: 1,
    selectedAt: now,
    lastCorrelationRef: correlationRefValue,
  })
}
