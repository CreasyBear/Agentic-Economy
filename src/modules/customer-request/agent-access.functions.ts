import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { issueCustomerRequestAgentKey, revokeCustomerRequestAgentKey } from './agent-access'

const inputSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  idempotencyKey: z.string().trim().min(8).max(128),
})

export const issueCustomerRequestAgentKeyServer = createServerFn({ method: 'POST' })
  .validator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { isAuthenticated, userId } = await auth()
    const client = clerkClient()
    return issueCustomerRequestAgentKey({
      principal: isAuthenticated && userId !== null ? { userId } : undefined,
      input: data,
      api: {
        list: (query) => client.apiKeys.list(query),
        create: (value) => client.apiKeys.create({ ...value, scopes: [...value.scopes] }),
        getSecret: (keyId) => client.apiKeys.getSecret(keyId),
      },
    })
  })

export const revokeCustomerRequestAgentKeyServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({ keyId: z.string().trim().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { isAuthenticated, userId } = await auth()
    const client = clerkClient()
    return revokeCustomerRequestAgentKey({
      principal: isAuthenticated && userId !== null ? { userId } : undefined,
      keyId: data.keyId,
      api: {
        get: (keyId) => client.apiKeys.get(keyId),
        revoke: (value) => client.apiKeys.revoke(value),
      },
    })
  })
