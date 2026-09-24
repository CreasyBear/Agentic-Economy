import { createFileRoute } from '@tanstack/react-router'

import { TaxProfileFormSection } from '@/components/ae/settings/TaxProfileFormSection'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/tax')({
  ...operatorRouteOptions,
  head: () => ({ meta: [{ title: 'Tax | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: TaxProfileFormSection,
})
