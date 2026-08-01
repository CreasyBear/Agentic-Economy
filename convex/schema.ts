import { defineSchema } from 'convex/server'

import { businessTables } from '../src/modules/business/internal/schema'
import { catalogTables } from '../src/modules/catalog/internal/schema'
import { capabilityContractRegistryTables } from '../src/modules/capability-contract-registry/internal/convex-schema'
import { capabilitySupplyTables } from '../src/modules/capability-supply/internal/convex-schema'
import { customerRequestTables } from '../src/modules/customer-request/internal/convex-schema'
import { actionInvocationTables } from '../src/modules/action-invocation/internal/convex-schema'
import { demandTables } from '../src/modules/demand/internal/schema'
import { discoveryTables } from '../src/modules/discovery/internal/schema'
import { harnessTables } from '../src/modules/harness/internal/convex-schema'
import { inquiryTables } from '../src/modules/inquiries/internal/convex-schema'
import { answerThreadTables } from '../src/modules/answer-thread/internal/convex-schema'
import { enginePlanTables } from '../src/modules/plan-proposal/internal/convex-schema'
import { decisionMapTables } from '../src/modules/decision-map/internal/convex-schema'
import { notificationOutboxTables } from '../src/modules/notification-outbox/internal/schema'
import { observabilityTables } from '../src/modules/observability/internal/schema'
import { registryTables } from '../src/modules/registry/internal/schema'
import { routingKernelTables } from '../src/modules/routing-kernel/internal/convex-schema'
import { securityTables } from '../src/modules/security/internal/schema'
import { moneyTables } from '../src/modules/money/internal/convex-schema'
import { settingsTables } from '../src/modules/settings/internal/schema'
import { projectSpineTables } from '../src/modules/project-spine/internal/convex-schema'

export default defineSchema({
  ...actionInvocationTables,
  ...answerThreadTables,
  ...enginePlanTables,
  ...decisionMapTables,
  ...businessTables,
  ...catalogTables,
  ...capabilityContractRegistryTables,
  ...capabilitySupplyTables,
  ...customerRequestTables,
  ...registryTables,
  ...routingKernelTables,
  ...demandTables,
  ...discoveryTables,
  ...harnessTables,
  ...inquiryTables,
  ...notificationOutboxTables,
  ...observabilityTables,
  ...securityTables,
  ...moneyTables,
  ...settingsTables,
  ...projectSpineTables,
})
