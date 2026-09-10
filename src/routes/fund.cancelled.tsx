import { createFileRoute } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'

export const Route = createFileRoute('/fund/cancelled')({
  head: () => ({ meta: [
    { title: 'Payment cancelled | Agentic Economy' },
    { name: 'robots', content: 'noindex, noarchive' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  component: () => <AePageState tone="neutral" title="Payment cancelled" description="No Account credit or authority changed. Return to the agent if you still want to fund it." />,
})
