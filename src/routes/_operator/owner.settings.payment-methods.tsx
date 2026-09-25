import { createFileRoute } from '@tanstack/react-router'
import { PaymentMethodsPage } from '@/components/ae/settings/billing/PaymentMethodsPage'
import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/payment-methods')({
  ...operatorRouteOptions,
  head: () => ({ meta: [{ title: 'Payment methods | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: PaymentMethodsPage,
})
