import { defineApp } from 'convex/server'
import { v } from 'convex/values'

export default defineApp({
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
