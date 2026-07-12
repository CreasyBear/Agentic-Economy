import { defineSchema } from 'convex/server'

import { businessActionTables } from './businessActionStore'
import { businessTables } from '../src/modules/business/internal/schema'
import { billingTables } from '../src/modules/billing/internal/schema'
import { clearanceTables } from '../src/modules/clearance/internal/schema'
import { capabilityTables } from '../src/modules/capabilities/internal/schema'
import { catalogTables } from '../src/modules/catalog/internal/schema'
import { demandTables } from '../src/modules/demand/internal/schema'
import { discoveryTables } from '../src/modules/discovery/internal/schema'
import { harnessTables } from '../src/modules/harness/internal/convex-schema'
import { inquiryTables } from '../src/modules/inquiries/internal/convex-schema'
import { answerThreadTables } from '../src/modules/answer-thread/internal/convex-schema'
import { notificationOutboxTables } from '../src/modules/notification-outbox/internal/schema'
import { observabilityTables } from '../src/modules/observability/internal/schema'
import { protectedActionTables } from '../src/modules/protected-action/internal/schema'
import { registryTables } from '../src/modules/registry/internal/schema'
import { routingKernelTables } from '../src/modules/routing-kernel/internal/convex-schema'
import { securityTables } from '../src/modules/security/internal/schema'
import { settingsTables } from '../src/modules/settings/internal/schema'

export default defineSchema({
  ...answerThreadTables,
  ...billingTables,
  ...businessActionTables,
  ...businessTables,
  ...capabilityTables,
  ...clearanceTables,
  ...catalogTables,
  ...registryTables,
  ...routingKernelTables,
  ...demandTables,
  ...discoveryTables,
  ...harnessTables,
  ...inquiryTables,
  ...notificationOutboxTables,
  ...protectedActionTables,
  ...observabilityTables,
  ...securityTables,
  ...settingsTables,
})
