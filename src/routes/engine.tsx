import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeCustomerRequestWorkspace } from '@/components/ae/customer-request/AeCustomerRequestWorkspace'
import { AeContextualDecisionPrototype, type ContextualEntryAnchor } from '@/components/ae/customer-request/AeContextualDecisionPrototype'

type EngineSearch = Readonly<{ prototype?: 'decision-canvas'; anchor?: ContextualEntryAnchor; variant?: 'A' | 'B' | 'C' }>

export const Route = createFileRoute('/engine')({
  validateSearch: (search: Record<string, unknown>): EngineSearch => {
    const anchor = search.anchor
    const variant = search.variant
    return {
      ...(search.prototype === 'decision-canvas' ? { prototype: 'decision-canvas' as const } : {}),
      ...(anchor === 'place' || anchor === 'category' || anchor === 'need' || anchor === 'detailed' ? { anchor } : {}),
      ...(variant === 'A' || variant === 'B' || variant === 'C' ? { variant } : {}),
    }
  },
  head: () => ({ meta: [
    { title: 'What do you need? | Agentic Economy' },
    { name: 'description', content: 'Describe what you need and compare options from connected businesses.' },
  ] }),
  component: EngineRoute,
})

function EngineRoute() {
  const { prototype, anchor = 'place', variant } = Route.useSearch()
  const navigate = Route.useNavigate()
  if (import.meta.env.DEV && (prototype === 'decision-canvas' || variant !== undefined)) {
    return (
      <AePublicShell>
        <AeContextualDecisionPrototype
          anchor={anchor}
          onAnchorChange={(nextAnchor) => void navigate({ search: { prototype: 'decision-canvas', anchor: nextAnchor }, replace: true })}
        />
      </AePublicShell>
    )
  }
  return <AePublicShell><AeCustomerRequestWorkspace /></AePublicShell>
}
