import { Migrations } from '@convex-dev/migrations'

import { components } from './_generated/api'
import schema from './schema'

export const migrations = new Migrations(components.migrations, { schema })

/**
 * C14 (Well 4, D7): capabilityOfferings.presentation.price is being retired.
 * Unsets price on every offering so the validator can drop it from the schema
 * (C15) once production's remaining count is 0. Idempotent: docs that have
 * already been migrated (or never had a price) are skipped.
 */
export const removeOfferingPrice = migrations.define({
  table: 'capabilityOfferings',
  migrateOne: (_ctx, doc) => {
    const { price, ...presentationWithoutPrice } = doc.presentation
    if (price === undefined) return
    return { presentation: presentationWithoutPrice }
  },
})
