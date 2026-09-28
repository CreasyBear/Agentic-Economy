import { openRouterGatewayConfig } from '@/modules/model-gateway/public'
import { env } from '../../../_generated/server'

/** The same gateway options used by the anonymous chat stream. */
export function anonymousChatGatewayConfig() {
  return openRouterGatewayConfig({
    ...(env.OPENROUTER_API_KEY === undefined ? {} : { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY }),
    ...(env.AE_LLM_MODEL === undefined ? {} : { AE_LLM_MODEL: env.AE_LLM_MODEL }),
    ...(env.AE_SITE_URL === undefined ? {} : { SITE_URL: env.AE_SITE_URL }),
  })
}

export function anonymousChatRecipient(): Readonly<{ label: string; host: string }> | null {
  const config = anonymousChatGatewayConfig()
  if (config.apiKey === undefined) return null
  const host = new URL(config.baseUrl ?? 'https://openrouter.ai/api/v1').hostname.toLowerCase()
  return { label: host === 'openrouter.ai' ? 'OpenRouter' : host, host }
}
