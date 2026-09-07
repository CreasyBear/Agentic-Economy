import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import type { ToolDetailResult } from '@/modules/capability-supply/public'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'

export type PublicToolDetailRouteResult =
  | ToolDetailResult
  | Readonly<{ kind: 'source_unavailable'; toolRef: string }>

const inputSchema = z.strictObject({ toolRef: z.string() })

export const readPublicToolDetailRouteServer = createServerFn()
  .validator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<PublicToolDetailRouteResult> => {
    try {
      return await readCapabilityToolDetail(data)
    } catch {
      return { kind: 'source_unavailable', toolRef: data.toolRef }
    }
  })
