import { defineSchema } from 'convex/server'

import { businessTables } from '../src/modules/business/internal/schema'
import { catalogTables } from '../src/modules/catalog/internal/schema'
import { discoveryTables } from '../src/modules/discovery/internal/schema'
import { observabilityTables } from '../src/modules/observability/internal/schema'
import { registryTables } from '../src/modules/registry/internal/schema'
import { securityTables } from '../src/modules/security/internal/schema'

export default defineSchema({
  ...businessTables,
  ...catalogTables,
  ...registryTables,
  ...discoveryTables,
  ...observabilityTables,
  ...securityTables,
})
