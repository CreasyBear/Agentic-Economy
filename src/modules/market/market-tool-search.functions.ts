import { getRequest } from '@tanstack/react-start/server'
import { awaitBoundedRead as awaitMarketRead, SOURCE_READ_TIMEOUT_MS as MARKET_SOURCE_TIMEOUT_MS } from '@/lib/bounded-read'
import { createServerFn } from '@tanstack/react-start'
import { withSignal } from '@/lib/server/request-with-signal'

import { toolCatalogSearchInputSchema, type ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'

/** Public, read-only Market entry to the same assessment used by agent and HTTP search. */
export const searchMarketToolsServer = createServerFn({ method: 'GET' })
  .validator(data => toolCatalogSearchInputSchema.parse(data))
  .handler(async ({ data }): Promise<ToolChoiceSearchOutput> => {
    const request = getRequest()
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(MARKET_SOURCE_TIMEOUT_MS)])
    const boundedRequest = withSignal(request, signal)
    return await awaitMarketRead(() => registryToolsSearchAction.run({ data, context: { caller: 'ui', request: boundedRequest } }), signal)
  })
