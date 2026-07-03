import { createParkedFileRoute } from '../../route-helpers'
import { handleBillingWebhookRequest } from '../../../routes/api.billing.webhook'

export { handleBillingWebhookRequest } from '../../../routes/api.billing.webhook'

export const Route = createParkedFileRoute<never>('/api/billing/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handleBillingWebhookRequest(request),
    },
  },
})
