import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  loadAgentDirectoryReadback,
} from '@/modules/agent-access/agent-access-console'
import { readCapabilityOperationCompare } from '@/modules/capability-supply/operation-source'
import { isPublicOperationRef } from '@/modules/capability-supply/public'

export const readAgentDirectoryServer = createServerFn({ method: 'GET' })
  .handler(async () => loadAgentDirectoryReadback({
    compare: readCapabilityOperationCompare,
    isOperationRef: isPublicOperationRef,
  }))

export const readAgentDirectoryPageServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({ cursor: z.string().min(1).max(2_000) }).parse(data))
  .handler(async ({ data }) => loadAgentDirectoryReadback({
    compare: readCapabilityOperationCompare,
    isOperationRef: isPublicOperationRef,
  }, data.cursor))
