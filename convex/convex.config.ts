import aggregate from '@convex-dev/aggregate/convex.config'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'
import workpool from '@convex-dev/workpool/convex.config'

const app = defineApp({
  env: {
    OPENROUTER_API_KEY: v.optional(v.string()),
    AE_CUSTOMER_REQUEST_MODEL: v.optional(v.string()),
    AE_SITE_URL: v.optional(v.string()),
    AE_RELEASE_SOURCE_REVISION: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    AE_CONVEX_SERVER_FUNCTION_TOKEN: v.optional(v.string()),
    AE_ROUTE_CALL_SIGNING_SECRET: v.optional(v.string()),
    AE_ROUTE_CALL_SIGNING_KEY_ID: v.optional(v.string()),
    AE_X402_RPC_URLS_JSON: v.optional(v.string()),
  },
})

app.use(workflow)
app.use(workpool)
app.use(rateLimiter)
app.use(aggregate, { name: 'ownerActivationByStage' })

export default app
