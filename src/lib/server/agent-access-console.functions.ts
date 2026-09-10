import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  loadAgentDirectoryReadback,
} from '@/modules/agent-access/agent-access-console'
import { readCapabilityToolCompare } from '@/modules/capability-supply/tool-source'
import { isPublicToolRef } from '@/modules/capability-supply/public'

export const readAgentDirectoryServer = createServerFn({ method: 'GET' })
  .handler(async () => loadAgentDirectoryReadback({
    compare: readCapabilityToolCompare,
    isToolRef: isPublicToolRef,
  }))

export const readAgentDirectoryPageServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({ cursor: z.string().min(1).max(2_000) }).parse(data))
  .handler(async ({ data }) => loadAgentDirectoryReadback({
    compare: readCapabilityToolCompare,
    isToolRef: isPublicToolRef,
  }, data.cursor))
