import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import type { OperationDetailResult } from '@/modules/capability-supply/public'
import { readCapabilityOperationDetail } from '@/modules/capability-supply/operation-source'

export type PublicOperationDetailRouteResult =
  | OperationDetailResult
  | Readonly<{ kind: 'source_unavailable'; operationRef: string }>

const inputSchema = z.strictObject({ operationRef: z.string() })

export const readPublicOperationDetailRouteServer = createServerFn()
  .validator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<PublicOperationDetailRouteResult> => {
    try {
      return await readCapabilityOperationDetail(data)
    } catch {
      return { kind: 'source_unavailable', operationRef: data.operationRef }
    }
  })
