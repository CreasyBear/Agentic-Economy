import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'

export const Route = createFileRoute('/engine')({
  head: () => ({ meta: [
    { title: 'What do you need? | Agentic Economy' },
    { name: 'description', content: 'Describe what you need and compare options from connected businesses.' },
  ] }),
  component: EngineRoute,
})

function EngineRoute() {
  return <AePublicShell><AeCustomerRequestWorkspace /></AePublicShell>
}
