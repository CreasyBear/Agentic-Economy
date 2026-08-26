import { defineSchema } from 'convex/server'
import { businessTables } from '../src/modules/business/schema'
import { catalogTables } from '../src/modules/catalog/schema'
import { capabilityContractRegistryTables } from '../src/modules/capability-contract-registry/schema'
import { capabilitySupplyTables } from '../src/modules/capability-supply/schema'
import {
  agentAccessOAuthTables,
  agentAccessPolicyTables,
  agentAccessPrincipalTables,
} from '../src/modules/agent-access/public'
import { actionInvocationTables } from '../src/modules/action-invocation/schema'
import { capabilityOperationInvocationTables } from '../src/modules/capability-execution/schema'
import { observabilityTables } from '../src/modules/observability/schema'
import { registryTables } from '../src/modules/registry/schema'
import { securityTables } from '../src/modules/security/schema'
import { moneyTables } from '../src/modules/money/schema'
import { marketTables } from '../src/modules/market/schema'
import { chatTables } from '../src/modules/chat/schema'
import { principalAccountTables } from '../src/modules/principal-account/public'
import { authorityDelegationTables } from '../src/modules/authority/internal/convex-schema'
import { connectionTables } from '../src/modules/connections/internal/convex-schema'
import { secretReferenceTables } from '../src/modules/secrets/internal/convex-schema'
import { recoveryProductionTables } from '../src/modules/authority/recovery/public'

export default defineSchema({
  ...chatTables,
  ...actionInvocationTables,
  ...capabilityOperationInvocationTables,
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
  ...principalAccountTables,
  ...authorityDelegationTables,
  ...connectionTables,
  ...secretReferenceTables,
  ...recoveryProductionTables,
})
