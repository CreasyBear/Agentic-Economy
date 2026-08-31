import { createServerFn } from '@tanstack/react-start'

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
