import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import workflow from '@convex-dev/workflow/convex.config'
import workpool from '@convex-dev/workpool/convex.config'

const app = defineApp({
  env: {
    OPENROUTER_API_KEY: v.optional(v.string()),
    AE_CUSTOMER_REQUEST_MODEL: v.optional(v.string()),
    AE_SITE_URL: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    AE_CONVEX_SERVER_FUNCTION_TOKEN: v.optional(v.string()),
    AE_ROUTE_CALL_SIGNING_SECRET: v.optional(v.string()),
    AE_ROUTE_CALL_SIGNING_KEY_ID: v.optional(v.string()),
  },
})

app.use(workflow)
app.use(workpool)

export default app
