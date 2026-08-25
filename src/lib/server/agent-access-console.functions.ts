import { createServerFn } from '@tanstack/react-start'

import { loadAgentAccessConsoleReadback } from '@/modules/agent-access/agent-access-console'
import { readCapabilityOperationCompare } from '@/modules/capability-supply/operation-source'
import { isPublicOperationRef } from '@/modules/capability-supply/public'

export const readAgentAccessConsoleServer = createServerFn({ method: 'GET' })
  .handler(async () => loadAgentAccessConsoleReadback({
    compare: readCapabilityOperationCompare,
    isOperationRef: isPublicOperationRef,
  }))
