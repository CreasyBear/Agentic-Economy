import { httpActionGeneric } from 'convex/server'

import { secretLifecycleRpcHandler } from './lib/secrets/lifecycle/http'

export const secretLifecycleRpc = httpActionGeneric(secretLifecycleRpcHandler)
