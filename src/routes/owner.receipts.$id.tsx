import { createFileRoute, redirect } from '@tanstack/react-router'

import { AePageState } from '@/components/ae/layout/AePageState'
import {
  readOwnerMoneyDocumentUrlServer,
  renderOwnerMoneyDocumentServer,
} from '@/lib/server/money-documents.functions'

const documentRefPattern = /^[\w.:-]{1,500}$/u

/** The link in funding emails. The ledger document stays the source: this route only resolves its stored render, so the link never expires and the page is always the issued tax invoice or receipt. */
export const Route = createFileRoute('/owner/receipts/$id')({
  loader: async ({ params }) => {
    if (!documentRefPattern.test(params.id)) return { found: false as const }
    const data = { documentRef: params.id }
    const url = await readOwnerMoneyDocumentUrlServer({ data: { ...data, format: 'html' } })
      ?? await renderOwnerMoneyDocumentServer({ data }).catch(() => null)
    if (url === null) return { found: false as const }
    throw redirect({ href: url })
  },
  head: () => ({
    meta: [
      { title: 'Receipt | Agentic Economy' },
      { name: 'robots', content: 'noindex, noarchive' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  component: ReceiptUnavailable,
})

function ReceiptUnavailable() {
  return (
    <AePageState
      tone="neutral"
      title="Receipt not found"
      description="Sign in with the account that owns this receipt, then open the link again. Questions? Email support@aecon.ai."
    />
  )
}
