import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'

import {
  loadAgentDirectoryReadback,
} from '@/modules/agent-access/agent-access-console'

export const readAgentDirectoryServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({ principalRef: z.string().regex(/^prn_[0-9a-f]{32}$/u).optional(), callRef: z.string().min(1).max(500).optional() }).parse(data ?? {}))
  .handler(async ({ data }) => loadAgentDirectoryReadback(null, data.principalRef, data.principalRef === undefined ? undefined : data.callRef))

export const readAgentAccessEnvironmentServer = createServerFn({ method: 'GET' })
  .handler(async () => {
    const environment = deploymentPaymentEnvironment(process.env)
    if (environment === undefined) throw new Error('deployment_environment_required')
    return environment
  })

export const readAgentDirectoryPageServer = createServerFn({ method: 'GET' })
  .validator((data) => z.strictObject({ cursor: z.string().min(1).max(2_000) }).parse(data))
  .handler(async ({ data }) => loadAgentDirectoryReadback(data.cursor))
