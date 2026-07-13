import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'
import {
  AeCustomerRequestPrototype,
  type CustomerRequestPrototypeVariant,
} from '@/components/ae/customer-request/AeCustomerRequestPrototype'

type EngineSearch = Readonly<{ variant?: CustomerRequestPrototypeVariant }>

export const Route = createFileRoute('/engine')({
  validateSearch: (search: Record<string, unknown>): EngineSearch => {
    const variant = search.variant
    return variant === 'A' || variant === 'B' || variant === 'C' ? { variant } : {}
  },
  head: () => ({ meta: [
    { title: 'What do you need? | Agentic Economy' },
    { name: 'description', content: 'Describe what you need and compare options from connected businesses.' },
  ] }),
  component: EngineRoute,
})

function EngineRoute() {
  const { variant } = Route.useSearch()
  const navigate = Route.useNavigate()
  if (import.meta.env.DEV && variant !== undefined) {
    return (
      <AePublicShell>
        <AeCustomerRequestPrototype
          variant={variant}
          onVariantChange={(nextVariant) => void navigate({ search: { variant: nextVariant }, replace: true })}
        />
      </AePublicShell>
    )
  }
  return <AePublicShell><AeCustomerRequestWorkspace /></AePublicShell>
}
