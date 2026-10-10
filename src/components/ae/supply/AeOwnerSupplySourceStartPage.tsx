import { inventoryQueryFromReturnSearch, ownerInventoryReturnSearch, ownerToolSetupHref, type OwnerInventoryReturnSearch } from '@/lib/operator/owner-inventory-return'
import { Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'
import { useReverification } from '@clerk/tanstack-react-start'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSupplySourceNativeStart } from '@/components/ae/supply/AeSupplySourceNativeStart'
import './SupplyJourneyComposition.css'
import type { ProviderWorkspaceIdentityDetailResult } from '@/components/ae/offerings/provider-workspace.functions'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import {
  assessOwnerSupplySourceServer,
  filterOwnerSupplyAuthorityOptions,
  previewOwnerSupplySourceServer,
  publishOwnerSupplySourceServer,
  saveOwnerSupplySourceDraftServer,
  readOwnerProviderConnectionsServer,
  resumeOwnerSupplySourceDraftServer,
  startOwnerSupplySourceConnectionServer,
} from '@/modules/capability-supply/supply-funnel.functions'

export type AeOwnerSupplySourceStartPageProps = Readonly<{
  data: Readonly<{
    identity: ProviderWorkspaceIdentityDetailResult
    connections: Awaited<ReturnType<typeof readOwnerProviderConnectionsServer>>
    resume: Awaited<ReturnType<typeof resumeOwnerSupplySourceDraftServer>>
    resumeRequested: boolean
    sourceUnavailable: boolean
  }>
  search: OwnerInventoryReturnSearch & Readonly<{
    connection?: string
    environment?: 'sandbox' | 'production'
    draft?: string
  }>
  navigate: (opts: Readonly<{
    search: OwnerInventoryReturnSearch & Readonly<{
      draft: string
      connection?: string
      environment?: 'sandbox' | 'production'
    }>
    replace: true
  }>) => Promise<void>
}>

export function AeOwnerSupplySourceStartPage({ data, search, navigate }: AeOwnerSupplySourceStartPageProps) {
  const { identity, connections, resume, resumeRequested, sourceUnavailable } = data
  const inventoryQuery = inventoryQueryFromReturnSearch(search)
  const formRef = useRef<HTMLDivElement>(null)
  const [navigationSafety, setNavigationSafety] = useState<{
    dirty: boolean
    pending: boolean
    saveOutcome: 'idle' | 'saved' | 'failed' | 'outcome_unknown'
  }>({ dirty: false, pending: false, saveOutcome: 'idle' })
  const assess = useServerFn(assessOwnerSupplySourceServer)
  const preview = useServerFn(previewOwnerSupplySourceServer)
  const connect = useServerFn(startOwnerSupplySourceConnectionServer)
  const saveDraft = useServerFn(saveOwnerSupplySourceDraftServer)
  const publishRequest = useServerFn(publishOwnerSupplySourceServer)
  const publish = useReverification(publishRequest)

  return (
    <AeOperatorPage operatorRole="owner" title="Add Tool" description="Connect a Tool you already run. Agentic Economy checks what agents can buy." currentPath="/owner/operations/new">
      {identity.kind !== 'available' ? (
        <AeAlert tone="danger" title="Provider Workspace unavailable" className="arc-market arc-supply-owner-feedback"><div className="arc-supply-owner-feedback-description">
            <p>Agentic Economy could not confirm the current Business. Return to Tools and try again.</p>
            <Link
              to="/owner/operations"
              search={inventoryQuery ?? {}}
              className={`arc-market ${actionLinkClassName('secondary', 'md')} arc-supply-feedback-action`}
            >
              Return to Tools
            </Link>
          </div></AeAlert>
      ) : sourceUnavailable ? (
        <AeAlert tone="danger" title="Saved source unavailable" className="arc-market arc-supply-owner-feedback"><div className="arc-supply-owner-feedback-description">Agentic Economy could not read the saved source or current connections. Reload before starting or submitting another connection.</div></AeAlert>
      ) : (<>
        {resumeRequested && resume.kind !== 'available' ? (
          <AeAlert tone="danger" title="Saved source could not be resumed" className="arc-market arc-supply-owner-feedback mb-5"><div className="arc-supply-owner-feedback-description">The saved source is unavailable or changed. Review it from Add Tool before starting another connection.</div></AeAlert>
        ) : null}
        {resume.kind === 'available' ? <div className="mb-4 grid gap-2 rounded-lg border p-4" role="status">
          <p className="font-medium">Saved Tool setup restored</p>
          <p className="text-sm text-muted-foreground">Source and saved terms were read for this Provider. Review them before submitting; publication authority must be confirmed again.</p>
          <AeCopyReference label="Saved Tool setup reference" value={resume.candidateRef} />
          <a href={ownerToolSetupHref({ draft: resume.candidateRef, ...(resume.connectionRef === undefined ? {} : { connection: resume.connectionRef }), ...(resume.source.environment === undefined ? {} : { environment: resume.source.environment }) }, inventoryQuery)} className="justify-self-start text-sm underline underline-offset-4">Reopen this saved setup</a>
        </div> : null}
        <AeNavigationSafetyBoundary
          state={navigationSafety}
          blockSearchChanges
          title="Leave without saving these terms?"
          pendingTitle="Saving these terms"
          description="The terms you entered are not saved. Leave this page and they will be discarded."
          pendingDescription="Agentic Economy is still saving these terms."
          saveActionRef={formRef}
          headingRef={formRef}
        >
        <div ref={formRef} tabIndex={-1}>
        <AeSupplySourceNativeStart
          key={JSON.stringify([identity.businessId, search.draft ?? null, search.connection ?? null, search.environment ?? null])}
          businessRef={identity.businessId}
          {...(inventoryQuery === undefined ? {} : { returnInventoryQuery: inventoryQuery })}
          onNavigationSafetyChange={(next) => {
            setNavigationSafety((current) => (
              current.dirty === next.dirty && current.pending === next.pending && current.saveOutcome === next.saveOutcome
                ? current
                : next
            ))
          }}
          connections={filterOwnerSupplyAuthorityOptions(identity.businessId, connections)}
          {...(resume.kind === 'available' ? { initial: resume } : {})}
          onAssess={(input, signal) => assess({ data: input, signal })}
          onPreview={(source, idempotencyKey) => preview({ data: { businessId: identity.businessId, source, idempotencyKey } })}
          onConnect={(input) => connect({ data: input })}
          onSelectCandidate={(input) => saveDraft({ data: input })}
          onSaveTerms={(input) => saveDraft({ data: input })}
          onDraftSaved={async (candidateRef, connectionRef) => {
            await navigate({
              search: {
                draft: candidateRef,
                ...ownerInventoryReturnSearch(inventoryQuery),
                ...(connectionRef === undefined ? {} : { connection: connectionRef }),
                ...(search.environment === undefined ? {} : { environment: search.environment }),
              },
              replace: true,
            })
          }}
          onPublish={(input) => publish({ data: input })}
        />
        </div>
        </AeNavigationSafetyBoundary>
      </>)}
    </AeOperatorPage>
  )
}
