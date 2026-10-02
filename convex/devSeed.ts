import { env, internalMutation } from './_generated/server'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
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
  handler: async (ctx) => {
    requireDevelopmentDeployment()
    return await seedDevCatalogHandler(ctx)
  },
})

export const seedOfferingSupply = internalMutation({
  args: seedOfferingSupplyArgs,
  returns: seedOfferingSupplyResult,
  handler: async (ctx, args) => {
    requireDevelopmentDeployment()
    return await seedOfferingSupplyHandler(ctx, args)
  },
})

export const publishSandboxTool = internalMutation({
  args: publishSandboxToolArgs,
  returns: publishSandboxToolResult,
  handler: async (ctx, args) => {
    requireDevelopmentDeployment()
    return await publishSandboxToolHandler(ctx, args)
  },
})

export const seedSandboxSpendingPolicy = internalMutation({
  args: seedSandboxSpendingPolicyArgs,
  returns: seedSandboxSpendingPolicyResult,
  handler: async (ctx) => {
    requireDevelopmentDeployment()
    return await seedSandboxSpendingPolicyHandler(ctx)
  },
})

function requireDevelopmentDeployment(): void {
  if (deploymentPaymentEnvironment(env) !== 'sandbox') {
    throw new Error('dev_seed_deployment_refused')
  }
}
