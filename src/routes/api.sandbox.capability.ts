import { createFileRoute } from '@tanstack/react-router'

import { handleSandboxCapabilityRequest } from '@/lib/server/sandbox-capability-provider'

export const Route = createFileRoute('/api/sandbox/capability')({
  server: { handlers: { POST: ({ request }) => handleSandboxCapabilityRequest(request) } },
})
