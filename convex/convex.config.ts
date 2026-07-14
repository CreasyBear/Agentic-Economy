import { defineApp } from 'convex/server'
import { v } from 'convex/values'

export default defineApp({
  env: {
    OPENROUTER_API_KEY: v.optional(v.string()),
    AE_CUSTOMER_REQUEST_MODEL: v.optional(v.string()),
    AE_SITE_URL: v.optional(v.string()),
  },
})
