import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  loadAgentDirectoryReadback,
} from '@/modules/agent-access/agent-access-console'

export const readAgentDirectoryServer = createServerFn({ method: 'GET' })
  .handler(async () => loadAgentDirectoryReadback())

export const readAgentDirectoryPageServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({ cursor: z.string().min(1).max(2_000) }).parse(data))
  .handler(async ({ data }) => loadAgentDirectoryReadback(data.cursor))
