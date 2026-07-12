import { providerReadinessInventory } from './lib/provider-configuration.mjs'

const inventory = providerReadinessInventory(process.env)
process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`)
if (!process.argv.includes('--inventory-only') && (inventory.shippo.status !== 'configured' || inventory.easypost.status !== 'configured')) {
  process.exitCode = 1
}
