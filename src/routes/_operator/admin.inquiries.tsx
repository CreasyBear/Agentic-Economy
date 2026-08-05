import { createFileRoute } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  AllowedReadback,
  DeniedReadback,
  FilterPanel,
  OperatorAccess,
} from '@/components/ae/operator/AdminInquirySections'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { stringSearch } from '@/lib/operator/string-search'
import {
  readInquiryOperatorReconstructionServer,
  type InquiryOperatorReconstructionServerResult,
} from '@/modules/inquiries/inquiry.functions'

type AdminInquirySearch = {
  threadId?: string
  correlationId?: string
  dispatchId?: string
}

export const Route = createFileRoute('/_operator/admin/inquiries')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>): AdminInquirySearch =>
    compactSearch(stringSearch(search.threadId), stringSearch(search.correlationId), stringSearch(search.dispatchId)),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readInquiryOperatorReconstructionServer({ data: deps }),
  head: () => ({
    meta: [
      { title: 'Inquiry reconstruction | Agentic Economy' },
      { name: 'description', content: 'Admin inquiry reconstruction with private content redacted.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminInquiriesRoute,
})

function AdminInquiriesRoute() {
  const readback = Route.useLoaderData() as InquiryOperatorReconstructionServerResult
  const search = Route.useSearch() as AdminInquirySearch

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Inquiry reconstruction"
      description="Reconstruct customer inquiry, owner action, delivery, audit, funnel, and operation refs without exposing private content."
      currentPath="/admin/inquiries"
      navBadges={{ '/admin/inquiries': readback.kind === 'allowed' ? readback.summary.needsRepair : 0 }}
    >
      <OperatorAccess readback={readback} />
      <FilterPanel search={search} />
      {readback.kind === 'denied' ? <DeniedReadback readback={readback} /> : <AllowedReadback readback={readback} />}
    </AeOperatorShell>
  )
}

function compactSearch(threadId: string | undefined, correlationId: string | undefined, dispatchId: string | undefined): AdminInquirySearch {
  return {
    ...(threadId === undefined ? {} : { threadId }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(dispatchId === undefined ? {} : { dispatchId }),
  }
}
