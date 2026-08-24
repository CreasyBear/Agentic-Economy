import aggregate from '@convex-dev/aggregate/convex.config'
import agent from '@convex-dev/agent/convex.config'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workpool from '@convex-dev/workpool/convex.config'

const app = defineApp({
  env: {
    OPENROUTER_API_KEY: v.optional(v.string()),
    AE_LLM_MODEL: v.optional(v.string()),
    AE_CHAT_SHARE_SECRET: v.optional(v.string()),
    AE_CHAT_SHARE_KEY_ID: v.optional(v.string()),
    AE_CHAT_PROXY_SECRET: v.optional(v.string()),
    AE_SITE_URL: v.optional(v.string()),
    AE_RELEASE_SOURCE_REVISION: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    AE_CONVEX_SERVER_FUNCTION_TOKEN: v.optional(v.string()),
    AE_ROUTE_CALL_SIGNING_SECRET: v.optional(v.string()),
    AE_ROUTE_CALL_SIGNING_KEY_ID: v.optional(v.string()),
    AE_X402_RPC_URLS_JSON: v.optional(v.string()),
    AE_X402_PAYMENT_CREDENTIAL_REF: v.optional(v.string()),
    AE_X402_PAYMENT_PRIVATE_KEY: v.optional(v.string()),
    CDP_API_KEY_ID: v.optional(v.string()),
    CDP_API_KEY_SECRET: v.optional(v.string()),
    CDP_WALLET_SECRET: v.optional(v.string()),
    AE_X402_CDP_ACCOUNT_NAME: v.optional(v.string()),
    AE_X402_CUSTODY_ENABLED: v.optional(v.string()),
    AE_X402_CUSTODY_MAX_ATOMIC: v.optional(v.string()),
  },
})

app.use(workpool)
app.use(rateLimiter)
app.use(agent)
app.use(aggregate, { name: 'ownerActivationByStage' })
app.use(aggregate, { name: 'marketEvidence' })
app.use(aggregate, { name: 'marketOperationEvidence' })
app.use(aggregate, { name: 'marketOperationRatings' })
app.use(aggregate, { name: 'marketActiveOperations' })
app.use(aggregate, { name: 'marketActiveSuppliers' })

export default app
