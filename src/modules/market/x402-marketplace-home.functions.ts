import { createServerFn } from '@tanstack/react-start'
import { readX402MarketplaceHome } from './x402-marketplace-home.server'

export const readX402MarketplaceHomeServer = createServerFn({ method: 'GET' })
  .handler(async () => await readX402MarketplaceHome())
