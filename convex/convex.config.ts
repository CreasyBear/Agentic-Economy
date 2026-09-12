import aggregate from '@convex-dev/aggregate/convex.config'
import agent from '@convex-dev/agent/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workpool from '@convex-dev/workpool/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

const app = defineApp({
  // Required = needed in every environment, including a fresh anonymous local deployment with nothing set.
  // Everything else is environment-specific (Clerk/Stripe/CDP/OpenRouter/x402/feature flags), stays optional, and is surfaced by `ae doctor`.
  env: {
    OPENROUTER_API_KEY: v.optional(v.string()),
    AE_LLM_MODEL: v.optional(v.string()),
    AE_OPENROUTER_API_BASE_URL: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    AE_CHAT_SHARE_SECRET: v.optional(v.string()),
    AE_CHAT_SHARE_KEY_ID: v.optional(v.string()),
    AE_CHAT_PROXY_SECRET: v.optional(v.string()),
    AE_SITE_URL: v.optional(v.string()),
    AE_RELEASE_SOURCE_REVISION: v.optional(v.string()),
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    AE_CONVEX_SERVER_FUNCTION_TOKEN: v.optional(v.string()),
    AE_SECRET_LIFECYCLE_RPC_TOKEN: v.optional(v.string()),
    AE_ROUTE_CALL_SIGNING_SECRET: v.optional(v.string()),
    AE_ROUTE_CALL_SIGNING_KEY_ID: v.optional(v.string()),
    AE_PROVIDER_CONSEQUENCE_ORIGIN: v.optional(v.string()),
    AE_X402_RPC_URLS_JSON: v.optional(v.string()),
    AE_X402_PAYMENT_CREDENTIAL_REF: v.optional(v.string()),
    AE_X402_PAYMENT_PRIVATE_KEY: v.optional(v.string()),
    AE_X402_PAYMENT_SECRET_REF: v.optional(v.string()),
    AE_PROVIDER_TICKET_SIGNING_SECRET_REF: v.optional(v.string()),
    CDP_API_KEY_ID: v.optional(v.string()),
    CDP_API_KEY_SECRET: v.optional(v.string()),
    CDP_WALLET_SECRET: v.optional(v.string()),
    AE_X402_CDP_ACCOUNT_NAME: v.optional(v.string()),
    AE_X402_CDP_EXPECTED_EVM_ADDRESS: v.optional(v.string()),
    AE_X402_CDP_ACCOUNT_POLICY_ID: v.optional(v.string()),
    AE_X402_CDP_PROJECT_POLICY_ID: v.optional(v.string()),
    AE_X402_CDP_POLICY_RULES_DIGEST: v.optional(v.string()),
    AE_X402_CDP_CREDENTIAL_GENERATION: v.optional(v.string()),
    AE_X402_CUSTODY_ENABLED: v.optional(v.string()),
    AE_X402_CUSTODY_MAX_ATOMIC: v.optional(v.string()),
    AE_X402_CUSTODY_DAILY_MAX_ATOMIC: v.optional(v.string()),
    AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE: v.optional(v.string()),
    AE_PACKAGE5_WRITES_ENABLED: v.optional(v.string()),
    AE_SUPPLY_HTTP_CREDENTIALS_ENABLED: v.optional(v.string()),
    AE_SUPPLY_MCP_OAUTH_ENABLED: v.optional(v.string()),
    AE_PROVIDER_OFFBOARDING_ENABLED: v.optional(v.string()),
    STRIPE_READBACK_KEY: v.optional(v.string()),
    STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID: v.optional(v.string()),
    STRIPE_CHECKOUT_HOST: v.optional(v.string()),
    AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN: v.optional(v.string()),
    AE_PACKAGE5_FIXTURE_X402_PAY_TO: v.optional(v.string()),
  },
})

app.use(workpool)
app.use(workpool, { name: 'stripeWebhookWorkpool' })
app.use(workflow)
app.use(rateLimiter)
app.use(agent)
app.use(migrations)
app.use(aggregate, { name: 'marketEvidence' })
app.use(aggregate, { name: 'marketOperationEvidence' })
app.use(aggregate, { name: 'marketToolRatings' })
app.use(aggregate, { name: 'marketActiveTools' })
app.use(aggregate, { name: 'marketActiveProviders' })
app.use(aggregate, { name: 'marketDirectoryFacets' })

export default app
