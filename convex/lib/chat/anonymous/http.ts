import { recordAnonymousChat } from '@/lib/observability/journey'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import { openRouterModel } from '@/modules/model-gateway/public'
import { internal } from '../../../_generated/api'
import { env } from '../../../_generated/server'
import type { ActionCtx } from '../../../_generated/server'
import { handleAnonymousChatRequest, jsonError } from './request'
import { anonymousChatGatewayConfig } from './recipient'
import { streamAnonymousChatResponse } from './stream'

export async function anonymousChatHandler(ctx: ActionCtx, request: Request): Promise<Response> {
  return await handleAnonymousChatRequest(request, {
    proxySecret: env.AE_CHAT_PROXY_SECRET,
    admit: async (key) => await ctx.runMutation(internal.rateLimit.admit, {
      name: 'chat-anonymous',
      key,
    }),
    stream: async (messages, signal, continuation) => {
      const config = anonymousChatGatewayConfig()
      if (config.apiKey === undefined) {
        recordAnonymousChat('failed')
        return jsonError(503, 'chat_model_unconfigured')
      }
      try {
        return await streamAnonymousChatResponse(ctx, messages, openRouterModel(config, config.model), signal, continuation)
      } catch (error) {
        recordAnonymousChat('failed')
        console.error('[chat-anonymous] stream failed', sanitizeTelemetryError(error))
        return jsonError(503, 'chat_stream_failed')
      }
    },
  })
}
