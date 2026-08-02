import type { GenericDatabaseReader } from 'convex/server'
import type { DataModel, Id } from './_generated/dataModel'

type CatalogRuntimeReader = GenericDatabaseReader<DataModel>

export async function hasActiveBusinessSuppression(
  db: CatalogRuntimeReader,
  businessId: Id<'businesses'>,
): Promise<boolean> {
  const suppression = await db
    .query('suppressionRules')
    .withIndex('by_target_status', (query) =>
      query.eq('targetType', 'business').eq('targetRef', businessId).eq('status', 'active')
    )
    .unique()
  return suppression !== null
}
