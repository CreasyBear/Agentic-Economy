import { handleRoutingEdgeRequest } from './routing-edge'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await handleRoutingEdgeRequest(request, env)
  },
} satisfies ExportedHandler<Env>
