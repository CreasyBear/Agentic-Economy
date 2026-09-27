import { createServerFn } from '@tanstack/react-start'

import { toolCatalogSearchInputSchema, type ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'

/** Public, read-only Market entry to the same assessment used by agent and HTTP search. */
export const searchMarketToolsServer = createServerFn({ method: 'GET' })
  .validator(data => toolCatalogSearchInputSchema.parse(data))
  .handler(async ({ data }): Promise<ToolChoiceSearchOutput> =>
    await registryToolsSearchAction.run({ data, context: { caller: 'ui' } }))
