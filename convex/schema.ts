import { defineSchema } from 'convex/server'
import { businessTables } from '../src/modules/business/internal/schema'
import { catalogTables } from '../src/modules/catalog/internal/schema'
import { capabilityContractRegistryTables } from '../src/modules/capability-contract-registry/internal/convex-schema'
import { capabilitySupplyTables } from '../src/modules/capability-supply/internal/convex-schema'
import {
  agentAccessOAuthTables,
  agentAccessPolicyTables,
  agentAccessPrincipalTables,
} from '../src/modules/agent-access/public'
import { actionInvocationTables } from '../src/modules/action-invocation/internal/convex-schema'
import { capabilityOperationInvocationTables } from '../src/modules/capability-execution/internal/convex-schema'
import { observabilityTables } from '../src/modules/observability/internal/schema'
import { registryTables } from '../src/modules/registry/internal/schema'
import { securityTables } from '../src/modules/security/internal/schema'
import { moneyTables } from '../src/modules/money/internal/convex-schema'
import { marketTables } from '../src/modules/market/internal/convex-schema'
import { chatTables } from '../src/modules/chat/internal/convex-schema'
import { legacyReleaseATables } from './legacyReleaseASchema'

export default defineSchema({
  ...chatTables,
  ...actionInvocationTables,
  ...capabilityOperationInvocationTables,
  ...legacyReleaseATables,
  ...businessTables,
  ...catalogTables,
  ...capabilityContractRegistryTables,
  ...capabilitySupplyTables,
  ...agentAccessPrincipalTables,
  ...agentAccessPolicyTables,
  ...agentAccessOAuthTables,
  ...registryTables,
  ...observabilityTables,
  ...securityTables,
  ...moneyTables,
  ...marketTables,
})
