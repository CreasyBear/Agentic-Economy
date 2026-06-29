import { defineSchema } from 'convex/server'

import { businessTables } from '../src/modules/business/internal/schema'
import { billingTables } from '../src/modules/billing/internal/schema'
import { catalogTables } from '../src/modules/catalog/internal/schema'
import { discoveryTables } from '../src/modules/discovery/internal/schema'
import { inquiryTables } from '../src/modules/inquiries/internal/convex-schema'
import { notificationOutboxTables } from '../src/modules/notification-outbox/internal/schema'
import { observabilityTables } from '../src/modules/observability/internal/schema'
import { protectedActionTables } from '../src/modules/protected-action/internal/schema'
import { registryTables } from '../src/modules/registry/internal/schema'
import { securityTables } from '../src/modules/security/internal/schema'

export default defineSchema({
  ...billingTables,
  ...businessTables,
  ...catalogTables,
  ...registryTables,
  ...discoveryTables,
  ...inquiryTables,
  ...notificationOutboxTables,
  ...protectedActionTables,
  ...observabilityTables,
  ...securityTables,
})
