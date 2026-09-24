import { internalMutation } from './_generated/server'
import {
  seedDevCatalogArgs,
  seedDevCatalogResult,
  seedDevCatalogHandler,
  seedOfferingSupplyArgs,
  seedOfferingSupplyResult,
  seedOfferingSupplyHandler,
} from './lib/dev/seed/catalog'
import {
  publishSandboxToolArgs,
  publishSandboxToolResult,
  publishSandboxToolHandler,
} from './lib/dev/seed/sandboxPublication'
import {
  seedSandboxSpendingPolicyArgs,
  seedSandboxSpendingPolicyResult,
  seedSandboxSpendingPolicyHandler,
} from './lib/dev/seed/sandboxSpending'

export const seedDevCatalog = internalMutation({
  args: seedDevCatalogArgs,
  returns: seedDevCatalogResult,
  handler: seedDevCatalogHandler,
})

export const seedOfferingSupply = internalMutation({
  args: seedOfferingSupplyArgs,
  returns: seedOfferingSupplyResult,
  handler: seedOfferingSupplyHandler,
})

export const publishSandboxTool = internalMutation({
  args: publishSandboxToolArgs,
  returns: publishSandboxToolResult,
  handler: publishSandboxToolHandler,
})

export const seedSandboxSpendingPolicy = internalMutation({
  args: seedSandboxSpendingPolicyArgs,
  returns: seedSandboxSpendingPolicyResult,
  handler: seedSandboxSpendingPolicyHandler,
})
