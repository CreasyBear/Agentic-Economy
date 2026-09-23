import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { degrade } from '@/lib/observability/degrade'
import type { ToolDetailResult } from '@/modules/capability-supply/public'
import { readToolListingEvidence } from '@/modules/market/server'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'

export type PublicToolDetailRouteResult =
  | (ToolDetailResult & Readonly<{ evidence?: MarketListingEvidenceProjection }>)
  | Readonly<{ kind: 'source_unavailable'; toolRef: string }>

const inputSchema = z.strictObject({ toolRef: z.string() })

export const readPublicToolDetailRouteServer = createServerFn()
  .validator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<PublicToolDetailRouteResult> => {
    try {
      const result = await readCapabilityToolDetail(data)
      if (result.kind !== 'found') return result
      // Universal route loaders also run in the browser. Keep the evidence
      // query inside this existing server boundary alongside the descriptor.
      const evidence = await readToolListingEvidence(result.tool)
      return { ...result, ...(evidence === undefined ? {} : { evidence }) }
    } catch (cause) {
      return degrade(cause, { kind: 'source_unavailable', toolRef: data.toolRef } as const, {
        site: 'readPublicToolDetailRouteServer',
        reason: 'source_unavailable',
      })
    }
  })
