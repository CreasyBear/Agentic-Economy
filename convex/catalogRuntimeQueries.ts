import type { GenericDatabaseReader } from 'convex/server'
import type { DataModel, Id } from './_generated/dataModel'

type CatalogRuntimeReader = GenericDatabaseReader<DataModel>

export async function hasActiveBusinessSuppression(
  _db: CatalogRuntimeReader,
  _businessId: Id<'businesses'>,
): Promise<boolean> {
  return false
}
