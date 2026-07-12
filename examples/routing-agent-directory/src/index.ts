/// <reference path="../worker-configuration.d.ts" />

import { handleDirectoryRequest } from './directory'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleDirectoryRequest(request, env.AGENT_PUBLIC_JWK_BASE64URL)
  },
} satisfies ExportedHandler<Env>
